import type { APIRoute } from 'astro';
import { getCustomerSession } from '../../../lib/customerAccountAuth';
import { getLoyaltyBalance, getRedeemableLoyaltyPence } from '../../../lib/loyalty';
import { getAdapterEnv } from '../../../lib/runtimeEnv';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const session = await getCustomerSession({ request, locals }).catch(() => null);
  if (!session?.account.emailVerified) {
    return Response.json({ authenticated: false, points: 0, pence: 0, redeemablePence: 0 }, { status: 401 });
  }

  const balance = await getLoyaltyBalance(getAdapterEnv({ locals }), session.account.id);
  const redeemablePence = await getRedeemableLoyaltyPence(getAdapterEnv({ locals }), session.account.id);
  return Response.json({
    authenticated: true,
    points: balance.points,
    pence: balance.pence,
    redeemablePence,
    earnedPoints: balance.earnedPoints,
    redeemedPoints: balance.redeemedPoints,
  });
};
