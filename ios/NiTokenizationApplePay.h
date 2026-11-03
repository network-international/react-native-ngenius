#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

// Tokenization-only capture. The existing PAYMENT Apple Pay controller is separate.
@interface NiTokenizationApplePay : NSObject
- (void)presentFrom:(UIViewController *)parent
            config:(NSDictionary *)config
        completion:(void (^)(NSString *status, NSString *encryptedPayload))completion;
@end
