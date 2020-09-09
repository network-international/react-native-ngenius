#import "NiSdk.h"

@interface NiSdk ()
@property (nonatomic) RCTResponseSenderBlock cardResponseCallback;
@end

@implementation NiSdk

RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

RCT_EXPORT_METHOD(initiateCardPaymentUI:(NSDictionary *)orderResponse cardPayResponse:(RCTResponseSenderBlock)cardPayResponse) {
    UIViewController *rootViewController = [[[[UIApplication sharedApplication] delegate] window] rootViewController];
    NISdk *sdkInstance = [NISdk sharedInstance];
    self.cardResponseCallback = cardPayResponse;
    
    NSError *error;
    NSData *orderResponseJsonData = [NSJSONSerialization dataWithJSONObject: orderResponse options: 0 error:&error];
    if (!orderResponseJsonData) {
        NSLog(@"Got an error: %@", error);
    } else {
        OrderResponse *orderResponse = [OrderResponse decodeFromData: orderResponseJsonData error: nil];
        dispatch_async(dispatch_get_main_queue(), ^(void){
            [sdkInstance showCardPaymentViewWithCardPaymentDelegate: self overParent:rootViewController for: orderResponse];
        });
    }
}

- (void)paymentDidCompleteWith:(enum PaymentStatus)status {
    if(status == PaymentStatusPaymentSuccess) {
        if(self.cardResponseCallback != nil) {
            self.cardResponseCallback(@[@"Success"]);
        }
    } else if(status == PaymentStatusPaymentFailed) {
        if(self.cardResponseCallback != nil) {
            self.cardResponseCallback(@[@"Failed"]);
        }
    } else if(status == PaymentStatusPaymentCancelled) {
        if(self.cardResponseCallback != nil) {
            self.cardResponseCallback(@[@"Aborted"]);
        }
    }
}

@end
