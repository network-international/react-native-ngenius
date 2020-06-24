#import "NiSdk.h"

@interface NiSdk ()
@property (nonatomic) RCTResponseSenderBlock cardResponseCallback;
@end

@implementation NiSdk

RCT_EXPORT_MODULE()

RCT_EXPORT_METHOD(sampleMethod:(NSString *)stringArgument numberParameter:(nonnull NSNumber *)numberArgument callback:(RCTResponseSenderBlock)callback)
{
    // TODO: Implement some actually useful functionality
    callback(@[[NSString stringWithFormat: @"numberArgument: %@ stringArgument: %@", numberArgument, stringArgument]]);
}

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
//        NSLog(@"Success");
        if(self.cardResponseCallback != nil) {
            self.cardResponseCallback(@[@"Success"]);
        }
        // [self resetSelection];
        // [self showAlertWithTitle: @"Payment Successfull" andMessage: @"Your Payment was successfull."];
    } else if(status == PaymentStatusPaymentFailed) {
        if(self.cardResponseCallback != nil) {
            self.cardResponseCallback(@[@"Failed"]);
        }
//        NSLog(@"Failed");
        // [self showAlertWithTitle: @"Payment Failed" andMessage: @"Your Payment could not be completed."];
    } else if(status == PaymentStatusPaymentCancelled) {
//        NSLog(@"Cancelled");  
        if(self.cardResponseCallback != nil) {
            self.cardResponseCallback(@[@"Aborted"]);
        }
        // [self showAlertWithTitle: @"Payment Aborted" andMessage: @"You cancelled the payment request. You can try again!"];
    }
}

@end
