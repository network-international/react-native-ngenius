const STRINGS = {
  en: {
    PAYMENT_DISCLAIMER_1: "By clicking \"Pay\", you agree to the",
    PAYMENT_DISCLAIMER_2: "Terms and Conditions",
    PAYMENT_DISCLAIMER_3: "and authorize this transaction",
    TERMS_OF_USE: "Terms of Use",
    SUBSCRIPTION_TERMS_AND_CONDITIONS: "You'll be charged the specified amount at the listed frequency until you cancel. Prices may change as described in the applicable {termsOfUse}. You can cancel at any time. By subscribing, you agree to the {termsOfUse} and you authorize storage of your payment method for renewals and other purchases.",
    INSTALLMENT_TERMS_AND_CONDITIONS: "You will be charged the agreed instalment amount at the selected frequency for a fixed number of instalments until the total amount is paid in full. Charges will be made automatically using your stored payment method on each scheduled billing date. Any changes to the instalment amount or schedule will require your approval. By continuing, you agree to the {termsOfUse} and authorize storage of your payment method for scheduled installments.",
    UNSCHEDULED_TERMS_AND_CONDITIONS: "You authorize the merchant to store your card details securely and charge your card for future services or purchases you initiate. Charges will be made as and when services are availed. You may revoke this authorization at any time. You may withdraw this consent or delete your saved card at any time through the merchant.",
    ADD_CARD: 'Add Card',
    USE_CREDIT_DEBIT_CARD: 'Use credit or debit card',
    PAY_WITH: 'Pay with',
    APPLE_PAY: 'Apple Pay',
    PAY_WITH_APPLEPAY: 'Pay with Apple Pay',
    PAY_WITH_GOOGLEPAY: 'Pay with Google Pay',
    PAYMENT_OPTIONS_DIVIDER: 'Or select your payment options',
    CONTINUE_SHOPPING: 'Continue Shopping',
    DIGITAL_WALLETS: 'Digital Wallets',
    CANCEL: 'Cancel',
    CLOSE: 'Close',
    VERIFICATION_TITLE: 'Native flow completed',
    VERIFICATION_SUCCESS:
      'The secure native screen finished. An NI token was not created.',
    VERIFICATION_FAILED: 'The secure native screen did not complete.',
    CUSTOM_PENDING_PAYMENT_MESSAGE: 'Processing your payment securely...',
  },
  fr: {
    PAYMENT_DISCLAIMER_1: "En cliquant sur \"Payer\", vous acceptez",
    PAYMENT_DISCLAIMER_2: "les termes et conditions",
    PAYMENT_DISCLAIMER_3: "et autorisez cette transaction",
    TERMS_OF_USE: "Conditions d’utilisation",
    SUBSCRIPTION_TERMS_AND_CONDITIONS: "Vous serez débité(e) du montant indiqué selon la fréquence spécifiée jusqu’à annulation. Les prix peuvent être modifiés conformément aux {termsOfUse} applicables. Vous pouvez annuler à tout moment. En vous abonnant, vous acceptez les {termsOfUse} et autorisez l’enregistrement de votre moyen de paiement pour les renouvellements et autres achats.",
    INSTALLMENT_TERMS_AND_CONDITIONS: "Vous serez débité du montant convenu à la fréquence sélectionnée, pour un nombre fixe de mensualités, jusqu'au paiement intégral. Les prélèvements seront effectués automatiquement à chaque date d'échéance, selon le mode de paiement enregistré. Toute modification du montant ou de l'échéancier des mensualités nécessitera votre accord. En poursuivant, vous acceptez les {termsOfUse} et autorisez l'enregistrement de votre mode de paiement pour les prélèvements automatiques.",
    UNSCHEDULED_TERMS_AND_CONDITIONS: "Vous autorisez le commerçant à conserver vos informations de carte en toute sécurité et à débiter votre carte pour vos futurs achats ou services. Les débits seront effectués au fur et à mesure de l'utilisation des services. Vous pouvez révoquer cette autorisation à tout moment. Vous pouvez également retirer votre consentement ou supprimer votre carte enregistrée auprès du commerçant.",
    ADD_CARD: 'Ajouter une carte',
    USE_CREDIT_DEBIT_CARD: 'Utiliser une carte de crédit ou de débit',
    PAY_WITH: 'Payer avec',
    APPLE_PAY: 'Apple Pay',
    PAY_WITH_APPLEPAY: 'Payer avec Apple Pay',
    PAY_WITH_GOOGLEPAY: 'Payer avec Google Pay',
    PAYMENT_OPTIONS_DIVIDER: 'Ou sélectionnez vos options de paiement',
    CONTINUE_SHOPPING: 'Continuer vos achats',
    DIGITAL_WALLETS: 'Portefeuilles Numériques',
    CANCEL: 'Annuler',
    CLOSE: 'Fermer',
    VERIFICATION_TITLE: 'Flux natif terminé',
    VERIFICATION_SUCCESS:
      "L'écran natif sécurisé s'est terminé. Aucun jeton NI n'a été créé.",
    VERIFICATION_FAILED: "L'écran natif sécurisé ne s'est pas terminé.",
    CUSTOM_PENDING_PAYMENT_MESSAGE: 'Traitement sécurisé de votre paiement...',
  },
  ar: {
    PAYMENT_DISCLAIMER_1: "بالضغط على \"الدفع\"، فإنك توافق على",
    PAYMENT_DISCLAIMER_2: "الشروط والأحكام",
    PAYMENT_DISCLAIMER_3: "وتقوم بتفويض هذه الحركة",
    TERMS_OF_USE: "شروط الاستخدام",
    SUBSCRIPTION_TERMS_AND_CONDITIONS: "باشتراكك، فإنك توافق على {termsOfUse} وتفوضنا بالاحتفاظ بوسيلة الدفع الخاصة بك لأغراض التجديد وعمليات الشراء الأخرى.يمكنك الإلغاء في أي وقت.قد تتغير الأسعار وفقًا لما هو موضح في {termsOfUse} المعمول بها.سيتم خصم المبلغ المحدد وفقًا لمعدل التكرار الموضح إلى أن تقوم بالإلغاء.",
    INSTALLMENT_TERMS_AND_CONDITIONS: "سيتم خصم مبلغ القسط المتفق عليه وفقًا للوتيرة المحددة لعدد محدد من الأقساط حتى سداد المبلغ الإجمالي بالكامل. سيتم الخصم تلقائيًا باستخدام طريقة الدفع المحفوظة لديك في كل تاريخ إصدار فاتورة. أي تغييرات على مبلغ القسط أو جدول السداد تتطلب موافقتك. بمتابعتك، فإنك توافق على {termsOfUse} وتفوضنا بحفظ طريقة الدفع الخاصة بك للأقساط المجدولة.",
    UNSCHEDULED_TERMS_AND_CONDITIONS: "أنت تُفوض التاجر بتخزين بيانات بطاقتك بأمان وتحصيل رسوم الخدمات أو المشتريات المستقبلية التي تُجريها. سيتم تحصيل الرسوم عند استخدام الخدمات. يمكنك إلغاء هذا التفويض في أي وقت. كما يمكنك سحب موافقتك أو حذف بطاقتك المحفوظة في أي وقت من خلال التاجر.",
    ADD_CARD: 'إضافة بطاقة',
    USE_CREDIT_DEBIT_CARD: 'استخدم بطاقة الائتمان أو الخصم',
    PAY_WITH: 'ادفع باستخدام',
    APPLE_PAY: 'Apple Pay',
    PAY_WITH_APPLEPAY: 'ادفع باستخدام آبل باي',
    PAY_WITH_GOOGLEPAY: 'ادفع باستخدام جوجل باي',
    PAYMENT_OPTIONS_DIVIDER: 'أو اختر خيارات الدفع الخاصة بك',
    CONTINUE_SHOPPING: 'متابعة التسوق',
    DIGITAL_WALLETS: 'المحافظ الرقمية',
    CANCEL: 'إلغاء',
    CLOSE: 'إغلاق',
    VERIFICATION_TITLE: 'اكتمل التدفق الأصلي',
    VERIFICATION_SUCCESS: 'انتهت الشاشة الأصلية الآمنة. لم يتم إنشاء رمز NI.',
    VERIFICATION_FAILED: 'لم تكتمل الشاشة الأصلية الآمنة.',
    CUSTOM_PENDING_PAYMENT_MESSAGE: 'جاري معالجة دفعتك بأمان...',
  },
};

const tokenizeStrings = (language) => {
  const lang = (language || 'en').toLowerCase().slice(0, 2);
  return STRINGS[lang] || STRINGS.en;
};

const t = (language, key) => {
  const table = tokenizeStrings(language);
  return table[key] || STRINGS.en[key] || key;
};

module.exports = {
  STRINGS,
  tokenizeStrings,
  t,
};
