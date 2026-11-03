#import "NiSdk.h"
#import "NiTokenizationApplePay.h"
#import "NiTokenizationCard.h"
#import <React/RCTBridge.h>
#import <React/RCTEventDispatcher.h>
#import <PassKit/PassKit.h>
#import <UIKit/UIKit.h>

// NISdkColors fields are Swift-only, so colour mutation needs a Swift bridge.
@interface NiSdkColorConfigurator : NSObject
+ (void)applyColors:(NSDictionary *)colors;
+ (void)resetColors;
@end

@interface NiSdk ()
@property (nonatomic, weak) RCTBridge *bridge;
@property (nonatomic) RCTResponseSenderBlock paymentResponseCallback;
@property (nonatomic, strong) NiTokenizationApplePay *tokenizationApplePay;
@property (nonatomic, strong) NiTokenizationCard *tokenizationCard;
@end

// UIKit silently drops a presentation over a parent that is still presenting
// (e.g. a React Native Modal mid-dismiss). Retry for up to ~2s, then fail.
static void NiSdkWhenParentFreeForPresentation(UIViewController *parent,
                                               NSInteger attempt,
                                               void (^onReady)(void),
                                               void (^onFailed)(NSString *presentedClass)) {
  if (!parent.presentedViewController) {
    onReady();
    return;
  }
  if (attempt >= 20) {
    onFailed(NSStringFromClass([parent.presentedViewController class]));
    return;
  }
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.1 * NSEC_PER_SEC)),
                 dispatch_get_main_queue(), ^{
    NiSdkWhenParentFreeForPresentation(parent, attempt + 1, onReady, onFailed);
  });
}

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
    } else {
        NSError *decodeError = nil;
        OrderResponse *orderResponse = [OrderResponse decodeFromData: orderResponseJsonData error: &decodeError];
        // Guard: decoding the order can fail (e.g. an unexpected field type). The
        // SDK's `order` param is non-optional, so passing a nil order crashed with
        // EXC_BAD_ACCESS (0x0) inside PaymentViewController. Log the real reason and
        // surface a failure to JS instead of crashing.
        if (!orderResponse) {
            NSLog(@"[NiSdk] initiateCardPaymentUI: OrderResponse decode FAILED: %@", decodeError);
            if (self.paymentResponseCallback) {
                self.paymentResponseCallback(@[@"PaymentFailed"]);
            }
            return;
        }
        dispatch_async(dispatch_get_main_queue(), ^(void){
            UIViewController *rootViewController = [[[[UIApplication sharedApplication] delegate] window] rootViewController];
            NiSdkWhenParentFreeForPresentation(rootViewController, 0, ^{
                NISdk *sdkInstance = [NISdk sharedInstance];
                [sdkInstance showCardPaymentViewWithCardPaymentDelegate: self overParent:rootViewController for: orderResponse];
            }, ^(NSString *presentedClass) {
                NSLog(@"[NiSdk] initiateCardPaymentUI: presentation FAILED, still presenting %@", presentedClass);
                if (self.paymentResponseCallback) {
                    self.paymentResponseCallback(@[@"Failed"]);
                }
            });
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
        NSError *decodeError = nil;
        OrderResponse *orderResponse = [OrderResponse decodeFromData: orderResponseJsonData error: &decodeError];
        // Guard: decoding the order can fail (e.g. an unknown payment-method value
        // such as a new wallet/card scheme). The SDK's `for:` param is non-optional,
        // so passing a nil order crashes with EXC_BAD_ACCESS (0x0) inside the native
        // Apple Pay flow. Log the real reason and surface a failure to JS instead of
        // crashing — matching initiateCardPaymentUI above.
        if (!orderResponse) {
            NSLog(@"[NiSdk] initiateApplePay: OrderResponse decode FAILED: %@", decodeError);
            if (self.paymentResponseCallback) {
                self.paymentResponseCallback(@[@"PaymentFailed"]);
            }
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
            NiSdkWhenParentFreeForPresentation(rootViewController, 0, ^{
                [sdkInstance initiateApplePayWithApplePayDelegate: self
                cardPaymentDelegate: self
                         overParent: rootViewController
                                for: orderResponse
                               with: applePayRequest];
            }, ^(NSString *presentedClass) {
                NSLog(@"[NiSdk] initiateApplePay: presentation FAILED, still presenting %@", presentedClass);
                if (self.paymentResponseCallback) {
                    self.paymentResponseCallback(@[@"Failed"]);
                }
            });
        });
    }
}

RCT_EXPORT_METHOD(presentTokenizationCard:(NSDictionary *)config result:(RCTResponseSenderBlock)result) {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (self.tokenizationCard || self.tokenizationApplePay) { result(@[@"Failed", @{}]); return; }
        NiTokenizationCard *card = [[NiTokenizationCard alloc] initWithConfig:config ready:^(NSString *requestId) { [self.bridge.eventDispatcher sendDeviceEventWithName:@"NiTokenizationCardReady" body:@{@"requestId": requestId}]; }
          result:^(NSString *status, NSDictionary *response) { self.tokenizationCard = nil; result(@[status, response]); }];
        self.tokenizationCard = card;
        UIViewController *parent = [[[[UIApplication sharedApplication] delegate] window] rootViewController];
        NiSdkWhenParentFreeForPresentation(parent, 0, ^{ if (self.tokenizationCard == card) [card presentFrom:parent]; }, ^(NSString *presentedClass) { [card fail]; });
    });
}
RCT_EXPORT_METHOD(submitTokenizationCard:(NSString *)requestId request:(NSDictionary *)request) {
    dispatch_async(dispatch_get_main_queue(), ^{ if ([self.tokenizationCard.requestId isEqualToString:requestId]) [self.tokenizationCard submit:request]; });
}
RCT_EXPORT_METHOD(cancelTokenizationCard:(NSString *)requestId) {
    dispatch_async(dispatch_get_main_queue(), ^{ if ([self.tokenizationCard.requestId isEqualToString:requestId]) [self.tokenizationCard cancel]; });
}
RCT_EXPORT_METHOD(failTokenizationCard:(NSString *)requestId) {
    dispatch_async(dispatch_get_main_queue(), ^{ if ([self.tokenizationCard.requestId isEqualToString:requestId]) [self.tokenizationCard fail]; });
}

RCT_EXPORT_METHOD(captureApplePayToken:(NSDictionary *)config callback:(RCTResponseSenderBlock)callback) {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (self.tokenizationApplePay || self.tokenizationCard) { callback(@[@"Failed", @""]); return; }
        self.tokenizationApplePay = [NiTokenizationApplePay new];
        UIViewController *parent = [[[[UIApplication sharedApplication] delegate] window] rootViewController];
        NiSdkWhenParentFreeForPresentation(parent, 0, ^{
            [self.tokenizationApplePay presentFrom:parent config:config completion:^(NSString *status, NSString *payload) {
                self.tokenizationApplePay = nil;
                callback(@[status, payload ?: @""]);
            }];
        }, ^(NSString *presentedClass) {
            self.tokenizationApplePay = nil;
            callback(@[@"Failed", @""]);
        });
    });
}

RCT_EXPORT_METHOD(isApplePaySupported:(RCTResponseSenderBlock)sendResponse) {
    NISdk *sdkInstance = [NISdk sharedInstance];
    Boolean isApplyPaySupportedOnDevice = [sdkInstance deviceSupportsApplePay];
    sendResponse(@[[NSNumber numberWithBool:isApplyPaySupportedOnDevice]]);
}

RCT_EXPORT_METHOD(configureSDK:(NSDictionary *)config) {
    NISdk *sdkInstance = [NISdk sharedInstance];
    if (config[@"shouldShowOrderAmount"] != nil) {
        sdkInstance.shouldShowOrderAmount = [config[@"shouldShowOrderAmount"] boolValue];
    }
    if (config[@"shouldShowCancelAlert"] != nil) {
        sdkInstance.shouldShowCancelAlert = [config[@"shouldShowCancelAlert"] boolValue];
    }
}

RCT_EXPORT_METHOD(setLocale:(NSString *) language) {
    NISdk *sdkInstance = [NISdk sharedInstance];
    [sdkInstance setSDKLanguageWithLanguage: language];
}

RCT_EXPORT_METHOD(setSDKColors:(NSDictionary *)colors) {
    if (![colors isKindOfClass:[NSDictionary class]]) {
        return;
    }
    [NiSdkColorConfigurator applyColors:colors];
}

RCT_EXPORT_METHOD(resetSDKColors) {
    [NiSdkColorConfigurator resetColors];
}

RCT_EXPORT_METHOD(executeThreeDSTwo:(NSDictionary *)paymentResponseDict
                  threeDSTwoResponse:(RCTResponseSenderBlock)threeDSTwoResponse) {
    self.paymentResponseCallback = threeDSTwoResponse;

    NSError *error;
    NSData *paymentResponseJsonData = [NSJSONSerialization dataWithJSONObject: paymentResponseDict options: 0 error:&error];
    if (!paymentResponseJsonData) {
        NSLog(@"Got an error: %@", error);
    } else {
        PaymentResponse *paymentResponse = [PaymentResponse decodeFromData: paymentResponseJsonData error: nil];
        dispatch_async(dispatch_get_main_queue(), ^(void){
            UIViewController *rootViewController = [[[[UIApplication sharedApplication] delegate] window] rootViewController];
            NISdk *sdkInstance = [NISdk sharedInstance];
            [sdkInstance executeThreeDSTwoWithCardPaymentDelegate:self overParent:rootViewController for:paymentResponse];
        });
    }

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
