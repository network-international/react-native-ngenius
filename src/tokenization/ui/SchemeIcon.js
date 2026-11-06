import React from 'react';
import { VisaIcon, MastercardIcon, AmericanExpressIcon, DinersIcon, DiscoveryIcon, JcbIcon, UnionPayIcon, CreditCardIcon } from '../assets/PaypageSchemeIcons';

const ICONS = {
  VISA: VisaIcon,
  MASTERCARD: MastercardIcon,
  MC: MastercardIcon,
  AMEX: AmericanExpressIcon,
  AMERICANEXPRESS: AmericanExpressIcon,
  DINERS: DinersIcon,
  DINERSCLUB: DinersIcon,
  DISCOVER: DiscoveryIcon,
  DISCOVERY: DiscoveryIcon,
  JCB: JcbIcon,
  UNIONPAY: UnionPayIcon,
  CUP: UnionPayIcon,
};

export default function SchemeIcon({ scheme }) {
  const key = String(scheme || '').toUpperCase().replace(/[^A-Z]/g, '');
  const Icon = ICONS[key] || CreditCardIcon;
  return <Icon testID={`scheme-icon-${ICONS[key] ? key.toLowerCase() : 'card'}`} />;
}
