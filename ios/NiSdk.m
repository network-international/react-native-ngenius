#import "NiSdk.h"
#import <PassKit/PassKit.h>

@interface NiSdk ()
@property (nonatomic) RCTResponseSenderBlock paymentResponseCallback;
@end

@implementation NiSdk

RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

RCT_EXPORT_METHOD(initiateCardPaymentUI:(NSDictionary *)orderResponse cardPayResponse:(RCTResponseSenderBlock)cardPayResponse) {
    self.paymentResponseCallback = cardPayResponse;
    
    NSError *error;
    NSData *orderResponseJsonData = [NSJSONSerialization dataWithJSONObject: orderResponse options: 0 error:&error];
    if (!orderResponseJsonData) {
        NSLog(@"Got an error: %@", error);
    } else {
        OrderResponse *orderResponse = [OrderResponse decodeFromData: orderResponseJsonData error: nil];
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
    } else {
        OrderResponse *orderResponse = [OrderResponse decodeFromData: orderResponseJsonData error: nil];
        PKPaymentRequest *applePayRequest = [[PKPaymentRequest alloc] init];
        
        applePayRequest.merchantIdentifier = applePayConfig[@"merchantIdentifier"];
        applePayRequest.countryCode = applePayConfig[@"countryCode"];
        applePayRequest.currencyCode = applePayConfig[@"currencyCode"];
        applePayRequest.requiredShippingContactFields = [[NSSet alloc] initWithObjects: PKContactFieldPostalAddress, PKContactFieldEmailAddress, PKContactFieldPhoneNumber, nil];
        applePayRequest.merchantCapabilities = PKMerchantCapabilityDebit | PKMerchantCapabilityCredit | PKMerchantCapability3DS;
        applePayRequest.requiredBillingContactFields = [[NSSet alloc] initWithObjects: PKContactFieldPostalAddress, PKContactFieldName, nil];
        
        NSMutableArray<PKPaymentSummaryItem *> *summaryItems = [[NSMutableArray alloc] initWithCapacity: 1];
        [summaryItems addObject: [PKPaymentSummaryItem
                                         summaryItemWithLabel: @"Total"
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

- (void)paymentDidCompleteWith:(enum PaymentStatus)status {
    if(status == PaymentStatusPaymentSuccess) {
        if(self.paymentResponseCallback != nil) {
            self.paymentResponseCallback(@[@"Success"]);
        }
    } else if(status == PaymentStatusPaymentFailed) {
        if(self.paymentResponseCallback != nil) {
            self.paymentResponseCallback(@[@"Failed"]);
        }
    } else if(status == PaymentStatusPaymentCancelled) {
        if(self.paymentResponseCallback != nil) {
            self.paymentResponseCallback(@[@"Aborted"]);
        }
    }
}

@end
