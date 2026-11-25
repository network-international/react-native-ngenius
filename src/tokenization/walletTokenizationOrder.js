// Tokenization only captures a method. Keep the legacy payment order untouched.
const walletTokenizationOrder = order => ({
  ...order,
  amount: { ...order?.amount, value: 0, formattedValue: '0.00' },
});
module.exports = { walletTokenizationOrder };
