jest.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable' }));
const React = require('react');
const renderer = require('react-test-renderer');
const { act } = renderer;
const OrderSummary = require('../ui/OrderSummary').default;
const { normalizeOrderDetails } = require('../orderDetails');
let tree;
const byId = id => tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === id);
const render = (orderDetails, labels) => {
  act(() => { tree = renderer.create(React.createElement(OrderSummary, { value: normalizeOrderDetails({ orderDetails }), labels })); });
};
afterEach(() => { if (tree) act(() => tree.unmount()); tree = undefined; });

it('does not render an empty or invalid summary', () => {
  render({});
  expect(tree.toJSON()).toBeNull();
});

it('shows a valid amount, including zero, without an empty disclosure control', () => {
  render({ amount: { currencyCode: 'AED', value: 0 } });
  expect(byId('order-summary-amount')[0].props.children).toBe('AED 0.00');
  expect(byId('order-summary-header')[0].type).toBe('View');
  expect(byId('order-summary-details')).toHaveLength(0);
  expect(tree.root.findAllByType('Pressable')).toHaveLength(0);
});

it('starts collapsed, then reveals the supplied item fields without truncating descriptions or multiplying totals', () => {
  const description = 'A detailed product description '.repeat(40).trim();
  render({ amount: { currencyCode: 'AED', value: '3910' }, orderSummary: { items: [
    { description, category: 'Furniture', quantity: 3, totalPrice: { currencyCode: 'AED', value: '3910' } },
  ] } }, { orderSummary: 'Order summary', show: 'Show', hide: 'Hide', quantity: 'Quantity' });
  expect(byId('order-summary-header')[0].props.accessibilityState.expanded).toBe(false);
  expect(byId('order-summary-item')).toHaveLength(0);
  act(() => byId('order-summary-header')[0].props.onPress());
  expect(byId('order-summary-header')[0].props.accessibilityState.expanded).toBe(true);
  expect(byId('order-summary-item')).toHaveLength(1);
  const texts = tree.root.findAllByType('Text');
  expect(texts.some(node => node.props.children === description && node.props.numberOfLines === undefined)).toBe(true);
  expect(texts.some(node => node.props.children === 'Furniture')).toBe(true);
  expect(texts.some(node => node.props.children === 'Quantity: 3')).toBe(true);
  expect(JSON.stringify(tree.toJSON())).not.toContain('117.30');
  act(() => byId('order-summary-header')[0].props.onPress());
  expect(byId('order-summary-item')).toHaveLength(0);
});

it('allows item-only detail without inventing a total or currency', () => {
  render({ orderSummary: { items: [{ description: 'Merchant-supplied description' }] } });
  expect(byId('order-summary-amount')).toHaveLength(0);
  act(() => byId('order-summary-header')[0].props.onPress());
  expect(byId('order-summary-item')).toHaveLength(1);
  expect(byId('order-summary-total')).toHaveLength(0);
  expect(tree.root.findAllByType('Text').some(node => node.props.children === 'Amount')).toBe(false);
  expect(JSON.stringify(tree.toJSON())).not.toContain('AED');
  expect(JSON.stringify(tree.toJSON())).not.toContain('0.00');
});

it('displays only supplied fees and a supplied total, preserving each currency', () => {
  render({ amount: { currencyCode: 'AED', value: 1000 }, orderSummary: {
    shipping: { currencyCode: 'KWD', value: 0 }, total: { currencyCode: 'JPY', value: '3910' },
  } });
  expect(byId('order-summary-amount')[0].props.children).toBe('JPY 3,910');
  act(() => byId('order-summary-header')[0].props.onPress());
  expect(byId('order-summary-shipping')).toHaveLength(1);
  expect(byId('order-summary-tax')).toHaveLength(0);
  expect(byId('order-summary-total')).toHaveLength(1);
  expect(JSON.stringify(tree.toJSON())).toContain('KWD 0.000');
});

it('uses the localized disclosure labels supplied by the host UI', () => {
  render({ orderSummary: { items: [{ description: 'مقعد' }] } }, { orderSummary: 'ملخص الطلب', show: 'إظهار', hide: 'إخفاء' });
  expect(byId('order-summary-header')[0].props.accessibilityLabel).toBe('إظهار ملخص الطلب');
  act(() => byId('order-summary-header')[0].props.onPress());
  expect(byId('order-summary-header')[0].props.accessibilityLabel).toBe('إخفاء ملخص الطلب');
});
