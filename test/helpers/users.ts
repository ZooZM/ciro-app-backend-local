import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  User,
  UserDocument,
} from '../../src/modules/users/schemas/user.schema';
import { TEST_JWT_SECRET } from './replset';

let phoneCounter = 0;

export interface TestUser {
  id: string;
  name: string;
  phoneNumber: string;
  token: string;
  auth: { Authorization: string };
}

/** Creates a real `User` document and signs an access token for it. */
export async function createUser(
  app: INestApplication,
  name = 'Test User',
): Promise<TestUser> {
  const userModel = app.get<Model<UserDocument>>(getModelToken(User.name));
  const phoneNumber = `+9665${String(Date.now() % 1e6).padStart(6, '0')}${phoneCounter++}`;
  const user = await userModel.create({
    name,
    phoneNumber,
    isPhoneVerified: true,
  });
  const token = signAccessToken(user._id.toString(), phoneNumber);
  return {
    id: user._id.toString(),
    name,
    phoneNumber,
    token,
    auth: { Authorization: `Bearer ${token}` },
  };
}

export function signAccessToken(
  userId: string,
  phoneNumber = '+966500000000',
  extra: Record<string, unknown> = {},
): string {
  return new JwtService({ secret: TEST_JWT_SECRET }).sign(
    { sub: userId, phoneNumber, ...extra },
    { expiresIn: '15m' },
  );
}
