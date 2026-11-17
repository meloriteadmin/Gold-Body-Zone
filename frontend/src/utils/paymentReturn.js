/**
 * Verifies a Cashfree redirect return order against the backend without
 * trusting URL parameters alone. Always settles to a terminal outcome
 * ('confirmed' | 'pending' | 'failed' | 'error') so UI spinners never hang.
 */
export async function verifyReturnedOrder({
  orderId,
  statusToken: paramStatusToken = null,
  readCheckoutSession,
  saveCheckoutSession,
  verifyOrderPayment,
  accessToken = null,
  refreshRegistrations = null,
}) {
  if (!orderId) {
    return {
      status: 'error',
      registration: null,
      statusToken: null,
      error: 'Missing Cashfree order ID for verification.',
    };
  }

  const saved = readCheckoutSession ? readCheckoutSession(orderId) : null;
  const effectiveStatusToken = paramStatusToken || saved?.statusToken || undefined;

  try {
    const res = await verifyOrderPayment(
      {
        orderId,
        statusToken: effectiveStatusToken,
      },
      accessToken
    );

    const registration = res?.registration || null;
    const statusToken = res?.statusToken || saved?.statusToken || null;

    if (res?.statusToken && saveCheckoutSession) {
      saveCheckoutSession({
        orderId,
        statusToken: res.statusToken,
        registrationId: registration?.id,
      });
    }

    if (accessToken && refreshRegistrations) {
      await refreshRegistrations().catch(() => {});
    }

    const isConfirmed =
      registration?.paymentStatus === 'PAID' &&
      registration?.registrationStatus === 'CONFIRMED';

    if (isConfirmed) {
      return {
        status: 'confirmed',
        registration,
        statusToken,
        error: '',
      };
    }

    if (registration?.paymentStatus === 'FAILED') {
      return {
        status: 'failed',
        registration,
        statusToken,
        error: 'Payment not completed. Please retry to confirm your registration.',
      };
    }

    return {
      status: 'pending',
      registration,
      statusToken,
      error: 'Payment not completed. Please retry to confirm your registration.',
    };
  } catch (err) {
    return {
      status: 'error',
      registration: null,
      statusToken: saved?.statusToken || null,
      error:
        err?.message ||
        'Payment not completed. Please retry to confirm your registration.',
    };
  }
}
