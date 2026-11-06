import React, { useState, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';

// Accept only the normalized presentation view model, never a payment request.
export default function OrderSummary({ value, styles = {}, labels = {}, initialExpanded = false }) {
  const [expanded, setExpanded] = useState(initialExpanded === true);
  useEffect(() => { setExpanded(initialExpanded === true); }, [value, initialExpanded]);
  if (!value) return null;
  const items = Array.isArray(value.items) ? value.items : [];
  const amount = value.total || value.amount;
  const hasDetails = items.length > 0 || Boolean(value.shipping || value.tax);
  if (!amount && !hasDetails) return null;
  const title = labels.orderSummary || 'Order summary';
  const Header = hasDetails ? Pressable : View;
  const fees = [
    value.shipping && { id: 'shipping', label: labels.shipping || 'Shipping', amount: value.shipping },
    value.tax && { id: 'tax', label: labels.tax || 'Tax', amount: value.tax },
    value.total && { id: 'total', label: labels.total || 'Total', amount: value.total },
  ].filter(Boolean);

  return (
    <View testID="tokenization-order-summary" style={styles.orderSummaryContainer}>
      <Header testID="order-summary-header" style={styles.orderSummaryHeader}
        {...(hasDetails ? { accessibilityRole: 'button', accessibilityState: { expanded },
          accessibilityLabel: `${expanded ? labels.hide || 'Hide' : labels.show || 'Show'} ${title}${amount ? `, ${amount.text}` : ''}`,
          onPress: () => setExpanded(current => !current) } : { accessible: true, accessibilityLabel: `${title}, ${amount.text}` })}>
        <Text style={styles.orderSummaryTitle}>{title}</Text>
        {amount ? <Text testID="order-summary-amount" style={styles.orderSummaryAmount}>{amount.text}</Text> : null}
        {hasDetails ? <Text style={styles.orderSummaryChevron} accessibilityElementsHidden>{expanded ? '⌃' : '⌄'}</Text> : null}
      </Header>
      {hasDetails && expanded ? (
        <View testID="order-summary-details" style={styles.orderSummaryBody}>
          {items.length ? <View style={styles.orderSummaryColumns} accessibilityElementsHidden>
            <Text style={styles.orderSummaryColumnLabel}>{labels.items || 'Items'}</Text>
            <Text style={styles.orderSummaryColumnLabel}>{labels.amount || 'Amount'}</Text>
          </View> : null}
          {items.map(item => (
            <View key={item.id} testID="order-summary-item" style={styles.orderSummaryItem}>
              <View style={styles.orderSummaryItemDetails}>
                <Text style={styles.orderSummaryDescription}>{item.description}</Text>
                {item.category ? <Text style={styles.orderSummaryMeta}>{item.category}</Text> : null}
                {item.quantity !== undefined ? <Text style={styles.orderSummaryMeta}>{labels.quantity ? `${labels.quantity}: ${item.quantity}` : `× ${item.quantity}`}</Text> : null}
              </View>
              {item.totalPrice ? <Text style={styles.orderSummaryItemAmount}>{item.totalPrice.text}</Text> : null}
            </View>
          ))}
          {fees.map(fee => (
            <View key={fee.id} testID={`order-summary-${fee.id}`}
              style={[styles.orderSummaryFooterRow, fee.id === 'total' && styles.orderSummaryTotalRow]}>
              <Text style={styles.orderSummaryFooterLabel}>{fee.label}</Text>
              <Text style={styles.orderSummaryItemAmount}>{fee.amount.text}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
