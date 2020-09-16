#import <React/RCTBridgeModule.h>
#import <PassKit/PassKit.h>

@import NISdk;

@interface NiSdk : NSObject <RCTBridgeModule, CardPaymentDelegate, ApplePayDelegate>

@end
