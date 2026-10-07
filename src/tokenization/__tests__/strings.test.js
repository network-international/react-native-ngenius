const { t } = require('../strings');

describe('tokenization strings', () => {
  it('uses paypage keys rather than payment CTA copy for card', () => {
    expect(t('en', 'ADD_CARD')).toBe('Add Card');
    expect(t('en', 'USE_CREDIT_DEBIT_CARD')).toBe('Use credit or debit card');
    expect(t('en', 'PAY_WITH')).toBe('Pay with');
    expect(t('en', 'PAYMENT_OPTIONS_DIVIDER')).toBe('Or select your payment options');
    expect(t('en', 'CONTINUE_SHOPPING')).toBe('Continue Shopping');
    expect(t('en', 'VERIFICATION_SUCCESS')).toContain('An NI token was not created');
    expect(t('en', 'PAY_WITH_GOOGLEPAY')).toBe('Pay with Google Pay');
    expect(t('ar', 'ADD_CARD')).toBe('إضافة بطاقة');
    expect(t('fr', 'CANCEL')).toBe('Annuler');
  });

  it('falls back to English for unknown languages', () => {
    expect(t('de', 'ADD_CARD')).toBe('Add Card');
  });
});
