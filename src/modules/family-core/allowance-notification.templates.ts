import type { PushLocale } from '../notifications/device-token.schema';

/**
 * 026 (contracts/push-notifications.md): ar/en notification text, rendered
 * per device token locale. Each story registers its own `allowance.*` types.
 */
export type TemplateVars = Record<string, string | number | null | undefined>;
export type Rendered = { title: string; body: string };
export type Template = (vars: TemplateVars, locale: PushLocale) => Rendered;

/** `25.00 SAR` / `25.00 ر.س` from integer halalas, without floating point. */
export function formatSar(halalas: number, locale: PushLocale): string {
  const sign = halalas < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(halalas));
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cents = (abs % 100).toString().padStart(2, '0');
  return locale === 'en'
    ? `${sign}${whole}.${cents} SAR`
    : `${sign}${whole}.${cents} ر.س`;
}

const DECLINE_REASON_TEXT: Record<string, { en: string; ar: string }> = {
  CARD_INACTIVE: { en: 'Card is inactive', ar: 'البطاقة غير مفعّلة' },
  CARD_PAUSED: { en: 'Card is paused', ar: 'البطاقة موقوفة مؤقتًا' },
  BLOCKED_CATEGORY: { en: 'Blocked category', ar: 'فئة محظورة' },
  OVER_PER_PURCHASE_LIMIT: {
    en: 'Over per-purchase limit',
    ar: 'أعلى من حد الشراء الواحد',
  },
  OVER_DAILY_LIMIT: { en: 'Over daily limit', ar: 'أعلى من الحد اليومي' },
  INSUFFICIENT_BALANCE: { en: 'Not enough balance', ar: 'الرصيد غير كافٍ' },
  SERVICE_UNAVAILABLE: {
    en: 'Service unavailable, try again',
    ar: 'الخدمة غير متاحة، حاول مرة أخرى',
  },
};

export function declineReasonText(reason: unknown, locale: PushLocale): string {
  const entry = DECLINE_REASON_TEXT[String(reason)];
  return entry ? entry[locale] : locale === 'en' ? 'Declined' : 'مرفوضة';
}

const REQUEST_REASON_TEXT: Record<string, { en: string; ar: string }> = {
  food: { en: 'food', ar: 'الطعام' },
  transport: { en: 'transport', ar: 'المواصلات' },
  school: { en: 'school', ar: 'المدرسة' },
  other: { en: 'something else', ar: 'أمر آخر' },
};

export function requestReasonText(reason: unknown, locale: PushLocale): string {
  const entry = REQUEST_REASON_TEXT[String(reason)];
  return entry ? entry[locale] : str(reason);
}

/** Only strings and numbers are ever rendered; anything else is empty, never `[object Object]`. */
const str = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
const s = str;
const amount = (vars: TemplateVars, key: string, l: PushLocale) =>
  formatSar(Number(vars[key] ?? 0), l);

export const ALLOWANCE_TEMPLATES: Record<string, Template> = {};

export function registerTemplate(type: string, template: Template): void {
  ALLOWANCE_TEMPLATES[type] = template;
}

export function renderTemplate(
  type: string,
  vars: TemplateVars,
  locale: PushLocale,
): Rendered {
  const template = ALLOWANCE_TEMPLATES[type];
  if (!template) throw new Error(`No notification template for ${type}`);
  return template(vars, locale);
}

export const templateHelpers = { s, amount };

// ── US2: allowance.purchaseDeclined (to the child; FR-075, US2-10) ──
registerTemplate('allowance.purchaseDeclined', (v, l) => {
  const reason = declineReasonText(v.reason, l);
  const amountText = amount(v, 'amountHalalas', l);
  return l === 'en'
    ? {
        title: 'Purchase declined',
        body: `Declined: ${amountText} at ${s(v.merchant)}. ${reason}`,
      }
    : {
        title: 'تم رفض عملية الشراء',
        body: `مرفوضة: ${amountText} في ${s(v.merchant)}. ${reason}`,
      };
});

// ── US6: balance controls and card status (to the child; FR-075) ──
registerTemplate('allowance.topUp', (v, l) => {
  const a = amount(v, 'amountHalalas', l);
  return l === 'en'
    ? { title: 'Money added', body: `+${a} from your parent` }
    : { title: 'تمت إضافة مبلغ', body: `+${a} من والدك` };
});
registerTemplate('allowance.pullBack', (v, l) => {
  const a = amount(v, 'amountHalalas', l);
  return l === 'en'
    ? { title: 'Money moved back', body: `Your parent moved ${a} back` }
    : { title: 'تم سحب مبلغ', body: `قام والدك بسحب ${a}` };
});
registerTemplate('allowance.cardPaused', (_v, l) =>
  l === 'en'
    ? { title: 'Card paused', body: 'Your card is paused' }
    : { title: 'تم إيقاف البطاقة', body: 'بطاقتك موقوفة مؤقتًا' },
);
registerTemplate('allowance.cardResumed', (_v, l) =>
  l === 'en'
    ? { title: 'Card active', body: 'Your card is active again' }
    : { title: 'تم تفعيل البطاقة', body: 'بطاقتك فعّالة مرة أخرى' },
);

// ── US3: payouts (FR-031, FR-033, FR-035) ──
registerTemplate('allowance.payoutPaid', (v, l) => {
  const a = amount(v, 'amountHalalas', l);
  if (v.audience === 'parent') {
    return l === 'en'
      ? {
          title: 'Allowance paid',
          body: `${s(v.childName)}'s ${a} allowance was paid`,
        }
      : {
          title: 'تم دفع المصروف',
          body: `تم دفع مصروف ${s(v.childName)} بقيمة ${a}`,
        };
  }
  return l === 'en'
    ? { title: 'Allowance paid', body: `Your ${a} allowance is here` }
    : { title: 'وصل مصروفك', body: `وصل مصروفك بقيمة ${a}` };
});
registerTemplate('allowance.payoutFailed', (v, l) => {
  const a = amount(v, 'amountHalalas', l);
  const system = v.reason === 'SERVICE_UNAVAILABLE';
  if (l === 'en') {
    return {
      title: "Allowance couldn't be paid",
      body: system
        ? `${s(v.childName)}'s ${a} allowance couldn't be paid because of a problem on our side. Tap Pay now.`
        : `Couldn't pay ${s(v.childName)}'s ${a} allowance. Add money and tap Pay now.`,
    };
  }
  return {
    title: 'تعذّر دفع المصروف',
    body: system
      ? `تعذّر دفع مصروف ${s(v.childName)} بقيمة ${a} بسبب مشكلة من جانبنا. اضغط ادفع الآن.`
      : `تعذّر دفع مصروف ${s(v.childName)} بقيمة ${a}. أضف رصيدًا ثم اضغط ادفع الآن.`,
  };
});
registerTemplate('allowance.payoutReminder', (v, l) => {
  const need = amount(v, 'neededHalalas', l);
  const have = amount(v, 'balanceHalalas', l);
  return l === 'en'
    ? {
        title: 'Allowance due tomorrow',
        body: `Tomorrow's allowance needs ${need}. Your wallet has ${have}.`,
      }
    : {
        title: 'المصروف غدًا',
        body: `يحتاج مصروف الغد إلى ${need}. رصيد محفظتك ${have}.`,
      };
});

// ── US5: requests for more money (FR-053, FR-057, FR-052) ──
registerTemplate('allowance.requestCreated', (v, l) => {
  const a = amount(v, 'amountHalalas', l);
  const why = requestReasonText(v.reason, l);
  return l === 'en'
    ? {
        title: 'Request for money',
        body: `${s(v.childName)} is asking for ${a} for ${why}`,
      }
    : { title: 'طلب مبلغ', body: `يطلب ${s(v.childName)} مبلغ ${a} لـ${why}` };
});
registerTemplate('allowance.requestResolved', (v, l) => {
  const note = v.note ? ` "${s(v.note)}"` : '';
  if (v.status === 'approved' || v.status === 'partially_approved') {
    const a = amount(v, 'approvedAmountHalalas', l);
    return l === 'en'
      ? { title: 'Request approved', body: `You got ${a}.${note}` }
      : { title: 'تمت الموافقة', body: `حصلت على ${a}.${note}` };
  }
  return l === 'en'
    ? {
        title: 'Request declined',
        body: `Your request wasn't approved${note ? `.${note}` : ''}`,
      }
    : {
        title: 'تم رفض الطلب',
        body: `لم تتم الموافقة على طلبك${note ? `.${note}` : ''}`,
      };
});
registerTemplate('allowance.requestExpired', (_v, l) =>
  l === 'en'
    ? {
        title: 'Request expired',
        body: 'Your request expired. You can ask again.',
      }
    : {
        title: 'انتهى الطلب',
        body: 'انتهت صلاحية طلبك. يمكنك الطلب مرة أخرى.',
      },
);

// ── US7: purchase notifications to the parent (FR-081) ──
registerTemplate('allowance.purchase', (v, l) => {
  const a = amount(v, 'amountHalalas', l);
  if (v.outcome === 'declined') {
    const why = declineReasonText(v.reason, l);
    return l === 'en'
      ? {
          title: 'Purchase declined',
          body: `${s(v.childName)}'s ${a} purchase was declined: ${why}`,
        }
      : {
          title: 'تم رفض عملية شراء',
          body: `تم رفض عملية شراء ${s(v.childName)} بقيمة ${a}: ${why}`,
        };
  }
  return l === 'en'
    ? {
        title: 'New purchase',
        body: `${s(v.childName)} spent ${a} at ${s(v.merchant)}`,
      }
    : {
        title: 'عملية شراء جديدة',
        body: `أنفق ${s(v.childName)} مبلغ ${a} في ${s(v.merchant)}`,
      };
});

// ── US8: unlink (to the child; FR-006) ──
registerTemplate('allowance.unlinked', (_v, l) =>
  l === 'en'
    ? {
        title: 'Allowance turned off',
        body: 'Your allowance was turned off by your parent',
      }
    : { title: 'تم إيقاف المصروف', body: 'قام والدك بإيقاف مصروفك' },
);
