#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

@interface NiTokenizationCard : NSObject
@property (nonatomic, readonly) NSString *requestId;
- (instancetype)initWithConfig:(NSDictionary *)config ready:(void (^)(NSString *))ready
                       result:(void (^)(NSString *, NSDictionary *))result;
- (void)presentFrom:(UIViewController *)parent;
- (void)submit:(NSDictionary *)request;
- (void)cancel;
- (void)fail;
@end
