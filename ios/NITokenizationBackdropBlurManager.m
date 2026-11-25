#import <UIKit/UIKit.h>
#import <React/RCTViewManager.h>

@interface NITokenizationBackdropBlurManager : RCTViewManager
@end

@implementation NITokenizationBackdropBlurManager

RCT_EXPORT_MODULE(NITokenizationBackdropBlur)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (UIView *)view
{
  UIBlurEffect *effect = [UIBlurEffect effectWithStyle:UIBlurEffectStyleSystemThinMaterial];
  UIVisualEffectView *backdrop = [[UIVisualEffectView alloc] initWithEffect:effect];
  backdrop.userInteractionEnabled = NO;
  return backdrop;
}

@end
