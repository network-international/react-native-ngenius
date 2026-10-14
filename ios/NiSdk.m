#import "NiSdk.h"
#import <PassKit/PassKit.h>

@interface NiSdk ()
@property (nonatomic) RCTResponseSenderBlock paymentResponseCallback;
@end

@implementation NiSdk

RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup {
  // The native SDK underneath this bridge is the same binary a native integration uses, so
  // it cannot tell on its own that it is running inside React Native. Declare it here, once,
  // before any request can be made.
  [NISdk sharedInstance].platform = NIPlatformIOSReactNative;
  return YES;
}

RCT_EXPORT_METHOD(initiateCardPaymentUI:(NSDictionary *)orderResponse cardPayResponse:(RCTResponseSenderBlock)cardPayResponse) {
    self.paymentResponseCallback = cardPayResponse;
    
    NSError *error;
    NSData *orderResponseJsonData = [NSJSONSerialization dataWithJSONObject: orderResponse options: 0 error:&error];
    if (!orderResponseJsonData) {
        NSLog(@"Got an error: %@", error);
        [self sendPaymentResult:@"Failed"];
    } else {
        NSError *decodeError = nil;
        OrderResponse *orderResponse = [OrderResponse decodeFromData: orderResponseJsonData error: &decodeError];
        // Guard: decoding the order can fail (e.g. an unexpected field type). The
        // SDK's `order` param is non-optional, so passing a nil order crashed with
        // EXC_BAD_ACCESS (0x0) inside PaymentViewController. Log the real reason and
        // surface a failure to JS instead of crashing.
        if (!orderResponse) {
            NSLog(@"[NiSdk] initiateCardPaymentUI: OrderResponse decode FAILED: %@", decodeError);
            [self sendPaymentResult:@"PaymentFailed"];
            return;
        }
        dispatch_async(dispatch_get_main_queue(), ^(void){
            UIViewController *rootViewController = [[[[UIApplication sharedApplication] delegate] window] rootViewController];
            NISdk *sdkInstance = [NISdk sharedInstance];
            [sdkInstance showCardPaymentViewWithCardPaymentDelegate: self overParent:rootViewController for: orderResponse];
        });
    }
}

RCT_EXPORT_METHOD(initiateApplePay:(NSDictionary *)orderResponse applePayConfig:(NSDictionary *)applePayConfig applePayResponse:(RCTResponseSenderBlock)applePayResponse) {
    self.paymentResponseCallback = applePayResponse;
    
    NSError *error;
    NSData *orderResponseJsonData = [NSJSONSerialization dataWithJSONObject: orderResponse options: 0 error:&error];
    if (!orderResponseJsonData) {
        NSLog(@"Got an error: %@", error);
        [self sendPaymentResult:@"Failed"];
    } else {
        NSError *decodeError = nil;
        OrderResponse *orderResponse = [OrderResponse decodeFromData: orderResponseJsonData error: &decodeError];
        // Guard: decoding the order can fail (e.g. an unknown payment-method value
        // such as a new wallet/card scheme). The SDK's `for:` param is non-optional,
        // so passing a nil order crashes with EXC_BAD_ACCESS (0x0) inside the native
        // Apple Pay flow. Log the real reason and surface a failure to JS instead of
        // crashing — matching initiateCardPaymentUI above.
        if (!orderResponse) {
            NSLog(@"[NiSdk] initiateApplePay: OrderResponse decode FAILED: %@", decodeError);
            [self sendPaymentResult:@"PaymentFailed"];
            return;
        }
        PKPaymentRequest *applePayRequest = [[PKPaymentRequest alloc] init];
        
        applePayRequest.merchantIdentifier = applePayConfig[@"merchantIdentifier"];
        applePayRequest.countryCode = applePayConfig[@"countryCode"];
        applePayRequest.currencyCode = applePayConfig[@"currencyCode"];
        applePayRequest.requiredShippingContactFields = [[NSSet alloc] initWithObjects: PKContactFieldPostalAddress, PKContactFieldEmailAddress, PKContactFieldPhoneNumber, nil];
        applePayRequest.merchantCapabilities = PKMerchantCapabilityDebit | PKMerchantCapabilityCredit | PKMerchantCapability3DS;
        applePayRequest.requiredBillingContactFields = [[NSSet alloc] initWithObjects: PKContactFieldPostalAddress, PKContactFieldName, nil];
        
        NSMutableArray<PKPaymentSummaryItem *> *summaryItems = [[NSMutableArray alloc] initWithCapacity: 1];
        [summaryItems addObject: [PKPaymentSummaryItem
                                         summaryItemWithLabel: applePayConfig[@"merchantName"]
                                         amount: [[NSDecimalNumber alloc] initWithFloat: [applePayConfig[@"totalAmount"] floatValue]]]];
        applePayRequest.paymentSummaryItems = summaryItems;
    
        dispatch_async(dispatch_get_main_queue(), ^(void){
            UIViewController *rootViewController = [[[[UIApplication sharedApplication] delegate] window] rootViewController];
            NISdk *sdkInstance = [NISdk sharedInstance];
            
            [sdkInstance initiateApplePayWithApplePayDelegate: self
            cardPaymentDelegate: self
                     overParent: rootViewController
                            for: orderResponse
                           with: applePayRequest];
        });
    }
}

RCT_EXPORT_METHOD(isApplePaySupported:(RCTResponseSenderBlock)sendResponse) {
    NISdk *sdkInstance = [NISdk sharedInstance];
    Boolean isApplyPaySupportedOnDevice = [sdkInstance deviceSupportsApplePay];
    sendResponse(@[[NSNumber numberWithBool:isApplyPaySupportedOnDevice]]);
}

RCT_EXPORT_METHOD(setLocale:(NSString *) language) {
    NISdk *sdkInstance = [NISdk sharedInstance];
    [sdkInstance setSDKLanguageWithLanguage: language];
}

RCT_EXPORT_METHOD(executeThreeDSTwo:(NSDictionary *)paymentResponseDict
                  threeDSTwoResponse:(RCTResponseSenderBlock)threeDSTwoResponse) {
    self.paymentResponseCallback = threeDSTwoResponse;

    NSError *error;
    NSData *paymentResponseJsonData = [NSJSONSerialization dataWithJSONObject: paymentResponseDict options: 0 error:&error];
    if (!paymentResponseJsonData) {
        NSLog(@"Got an error: %@", error);
        [self sendPaymentResult:@"Failed"];
    } else {
        NSError *decodeError = nil;
        PaymentResponse *paymentResponse = [PaymentResponse decodeFromData: paymentResponseJsonData error: &decodeError];
        if (!paymentResponse) {
            NSLog(@"[NiSdk] executeThreeDSTwo: PaymentResponse decode FAILED: %@", decodeError);
            [self sendPaymentResult:@"Failed"];
            return;
        }
        dispatch_async(dispatch_get_main_queue(), ^(void){
            UIViewController *rootViewController = [[[[UIApplication sharedApplication] delegate] window] rootViewController];
            NISdk *sdkInstance = [NISdk sharedInstance];
            [sdkInstance executeThreeDSTwoWithCardPaymentDelegate:self overParent:rootViewController for:paymentResponse];
        });
    }

}

/// Reports a result to JS at most once. A React Native callback may be invoked only once, and a
/// pending one would otherwise be reused by the next payment.
- (void)sendPaymentResult:(NSString *)status {
    RCTResponseSenderBlock callback = self.paymentResponseCallback;
    self.paymentResponseCallback = nil;
    if (callback != nil) {
        callback(@[status]);
    }
}

/// Every native outcome is reported. Review and partial authorisation outcomes keep their own
/// names rather than "Failed": funds may already be held, so the merchant must check the order
/// status on their backend before offering a retry.
- (void)paymentDidCompleteWith:(enum PaymentStatus)status {
    switch (status) {
        case PaymentStatusPaymentSuccess:
            [self sendPaymentResult:@"Success"];
            break;
        case PaymentStatusPaymentFailed:
            [self sendPaymentResult:@"Failed"];
            break;
        case PaymentStatusPaymentCancelled:
            [self sendPaymentResult:@"Aborted"];
            break;
        case PaymentStatusPaymentPostAuthReview:
            [self sendPaymentResult:@"PostAuthReview"];
            break;
        case PaymentStatusPartiallyAuthorised:
            [self sendPaymentResult:@"PartiallyAuthorised"];
            break;
        case PaymentStatusPartialAuthDeclined:
            [self sendPaymentResult:@"PartialAuthDeclined"];
            break;
        case PaymentStatusPartialAuthDeclineFailed:
            [self sendPaymentResult:@"PartialAuthDeclineFailed"];
            break;
        case PaymentStatusInValidRequest:
            [self sendPaymentResult:@"InvalidRequest"];
            break;
        default:
            [self sendPaymentResult:@"Failed"];
            break;
    }
}

@end
