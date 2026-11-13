#import <PassKit/PassKit.h>
#import <React/RCTComponent.h>
#import <React/RCTViewManager.h>

// Presentation only. The event returns to the existing RN selection handler;
// payment configuration, capability checks and wallet launch stay with NiSdk.
@interface NIWalletButton : PKPaymentButton
@property (nonatomic, copy) RCTDirectEventBlock onPress;
@property (nonatomic, assign, getter=isDisabled) BOOL disabled;
@end

@implementation NIWalletButton

- (instancetype)init
{
  self = [super initWithPaymentButtonType:PKPaymentButtonTypePlain
                      paymentButtonStyle:PKPaymentButtonStyleBlack];
  if (self) {
    self.cornerRadius = 8;
    self.accessibilityLabel = @"Apple Pay";
    [self addTarget:self action:@selector(handlePress:) forControlEvents:UIControlEventTouchUpInside];
    self.disabled = YES;
  }
  return self;
}

- (void)setDisabled:(BOOL)disabled
{
  _disabled = disabled;
  self.enabled = !disabled;
  self.alpha = disabled ? 0.5 : 1.0;
}

- (void)handlePress:(id)sender
{
  if (!self.disabled && self.onPress) {
    self.onPress(@{});
  }
}

@end

@interface NIWalletButtonManager : RCTViewManager
@end

@implementation NIWalletButtonManager

RCT_EXPORT_MODULE(NIWalletButton)
RCT_EXPORT_VIEW_PROPERTY(onPress, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(disabled, BOOL)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (UIView *)view
{
  return [NIWalletButton new];
}

@end
