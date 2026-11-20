const { savedPaymentMethodSelection, defaultSelectedTokenRef } = require('../savedPaymentMethodSelection');

const card = {
  tokenRef: 'card-reference', type: 'CARD', status: 'VERIFIED',
  cardDetails: { scheme: 'VISA', last4: '1234', expiry: '2030-12', cardholderName: 'Private name', pan: 'private-pan' },
  internalField: 'private-value',
};

it('returns only the safe existing-method selection and does not imply a new token or payment', () => {
  expect(savedPaymentMethodSelection([card], 'card-reference')).toEqual({
    tokenRef: 'card-reference', type: 'CARD', walletType: null,
    cardDetails: { scheme: 'VISA', last4: '1234', expiry: '2030-12' },
  });
});

it('keeps token identities separate even when cards share their last four digits', () => {
  const other = { ...card, tokenRef: 'other-reference', cardDetails: { ...card.cardDetails, scheme: 'MASTERCARD' } };
  expect(savedPaymentMethodSelection([card, other], 'other-reference').cardDetails.scheme).toBe('MASTERCARD');
});

it.each(['AWAIT_3DS', 'FAILED'])('does not select an unverified %s method', status => {
  expect(savedPaymentMethodSelection([{ ...card, status }], card.tokenRef)).toBeNull();
});

it('rejects stale references and malformed records without exposing them', () => {
  expect(savedPaymentMethodSelection([], card.tokenRef)).toBeNull();
  expect(savedPaymentMethodSelection([card], 'removed-reference')).toBeNull();
  expect(savedPaymentMethodSelection([{ ...card, cardDetails: null }], card.tokenRef)).toBeNull();
});

it('preserves wallet identity separately from its funding card', () => {
  expect(savedPaymentMethodSelection([{ ...card, type: 'WALLET', walletType: 'APPLE_PAY' }], card.tokenRef)).toMatchObject({
    type: 'WALLET', walletType: 'APPLE_PAY',
  });
});

it('defaults to the first eligible method rather than a pending or malformed row', () => {
  const pending = { ...card, tokenRef: 'pending', status: 'AWAIT_3DS' };
  const malformed = { ...card, tokenRef: 'malformed', cardDetails: null };
  expect(defaultSelectedTokenRef([pending, malformed, card])).toBe(card.tokenRef);
});

it('preserves a valid manual choice on refresh and chooses the first eligible fallback when it disappears', () => {
  const other = { ...card, tokenRef: 'other-reference' };
  expect(defaultSelectedTokenRef([card, other], other.tokenRef)).toBe(other.tokenRef);
  expect(defaultSelectedTokenRef([card], other.tokenRef)).toBe(card.tokenRef);
  expect(defaultSelectedTokenRef([], other.tokenRef)).toBeNull();
  expect(defaultSelectedTokenRef(undefined, other.tokenRef)).toBeNull();
});
