import {
  SegmentLanguageLock,
  SpeakerLanguageCache,
} from './language-detection.util';

describe('SegmentLanguageLock', () => {
  it('locks onto the first non-empty detected language', () => {
    const lock = new SegmentLanguageLock();

    expect(lock.onResult(undefined, false)).toBeNull();
    expect(lock.onResult('en-US', false)).toBe('en-US');
    // A different language mid-segment does not override the lock
    expect(lock.onResult('fr-FR', false)).toBe('en-US');
    expect(lock.current).toBe('en-US');
  });

  it('resets the lock on a segment boundary (isFinal result)', () => {
    const lock = new SegmentLanguageLock();

    lock.onResult('en-US', false);
    const finalLanguage = lock.onResult('en-US', true);

    expect(finalLanguage).toBe('en-US');
    expect(lock.current).toBeNull();

    // Next segment can lock onto a different language
    expect(lock.onResult('ar-SA', false)).toBe('ar-SA');
  });

  it('supports an explicit reset on silence/VAD boundary', () => {
    const lock = new SegmentLanguageLock();

    lock.onResult('en-US', false);
    lock.reset();

    expect(lock.current).toBeNull();
    expect(lock.onResult('fr-FR', false)).toBe('fr-FR');
  });
});

describe('SpeakerLanguageCache', () => {
  it('falls back to the default language when nothing is cached', () => {
    const cache = new SpeakerLanguageCache();

    expect(
      cache.primaryLanguageForNextSegment('room1', 'speakerA', 'en-US'),
    ).toBe('en-US');
  });

  it('stores and returns the last detected language for a speaker', () => {
    const cache = new SpeakerLanguageCache();

    cache.recordDetectedLanguage('room1', 'speakerA', 'ar-SA');

    expect(
      cache.primaryLanguageForNextSegment('room1', 'speakerA', 'en-US'),
    ).toBe('ar-SA');
    // Other speakers/rooms are unaffected
    expect(
      cache.primaryLanguageForNextSegment('room1', 'speakerB', 'en-US'),
    ).toBe('en-US');
    expect(
      cache.primaryLanguageForNextSegment('room2', 'speakerA', 'en-US'),
    ).toBe('en-US');
  });

  it('clears a cache entry', () => {
    const cache = new SpeakerLanguageCache();

    cache.recordDetectedLanguage('room1', 'speakerA', 'ar-SA');
    cache.clear('room1', 'speakerA');

    expect(
      cache.primaryLanguageForNextSegment('room1', 'speakerA', 'en-US'),
    ).toBe('en-US');
  });
});
