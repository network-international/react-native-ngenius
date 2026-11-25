#import "NiTokenizationApplePay.h"
#import <PassKit/PassKit.h>

@interface NiTokenizationApplePay () <PKPaymentAuthorizationViewControllerDelegate>
@property (nonatomic, copy) void (^completion)(NSString *, NSString *);
@property (nonatomic, copy) NSString *encryptedPayload;
@property (nonatomic, strong) PKPaymentAuthorizationViewController *controller;
@property (nonatomic) BOOL authorized;
@end

@implementation NiTokenizationApplePay
+ (NSArray<PKPaymentNetwork> *)networksForConfig:(NSDictionary *)config {
    id configured = config[@"supportedNetworks"];
    if (!configured) return @[PKPaymentNetworkVisa, PKPaymentNetworkMasterCard, PKPaymentNetworkAmex];
    if (![configured isKindOfClass:NSArray.class] || [configured count] == 0) return nil;
    NSMutableDictionary<NSString *, PKPaymentNetwork> *available = [NSMutableDictionary new];
    for (PKPaymentNetwork network in PKPaymentRequest.availableNetworks) available[network.uppercaseString] = network;
    NSMutableArray<PKPaymentNetwork> *networks = [NSMutableArray new];
    for (id value in configured) {
        if (![value isKindOfClass:NSString.class]) return nil;
        NSString *key = [[value stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet] uppercaseString];
        if ([key isEqualToString:@"UNIONPAY"]) key = @"CHINAUNIONPAY";
        PKPaymentNetwork network = available[key];
        if (!network) return nil;
        if (![networks containsObject:network]) [networks addObject:network];
    }
    return networks;
}

+ (BOOL)isSupported:(NSDictionary *)config {
    NSArray<PKPaymentNetwork> *networks = [self networksForConfig:config];
    return networks.count > 0 && [PKPaymentAuthorizationViewController canMakePaymentsUsingNetworks:networks
                                                                                   capabilities:PKMerchantCapability3DS];
}

- (void)presentFrom:(UIViewController *)parent config:(NSDictionary *)config
        completion:(void (^)(NSString *, NSString *))completion {
    self.completion = completion;
    NSString *merchant = config[@"merchantIdentifier"];
    NSString *country = config[@"countryCode"];
    NSString *currency = config[@"currencyCode"];
    NSString *amount = config[@"amount"];
    NSArray<PKPaymentNetwork> *networks = [self.class networksForConfig:config];
    if (!parent || parent.presentedViewController ||
        networks.count == 0 ||
        (config[@"supportedNetworks"] && ![self.class isSupported:config]) ||
        ![merchant isKindOfClass:NSString.class] || merchant.length == 0 ||
        ![country isKindOfClass:NSString.class] || country.length != 2 ||
        ![currency isKindOfClass:NSString.class] || currency.length != 3 ||
        ![amount isKindOfClass:NSString.class] ||
        ![PKPaymentAuthorizationViewController canMakePayments]) {
        [self finish:@"Failed"];
        return;
    }
    NSDecimalNumber *total = [NSDecimalNumber decimalNumberWithString:amount];
    if ([total isEqual:NSDecimalNumber.notANumber] || [total compare:NSDecimalNumber.zero] == NSOrderedAscending) {
        [self finish:@"Failed"];
        return;
    }
    PKPaymentRequest *request = [PKPaymentRequest new];
    request.merchantIdentifier = merchant;
    request.countryCode = country;
    request.currencyCode = currency;
    request.merchantCapabilities = PKMerchantCapability3DS;
    request.supportedNetworks = networks;
    NSString *label = [config[@"merchantName"] isKindOfClass:NSString.class] ? config[@"merchantName"] : @"Total";
    request.paymentSummaryItems = @[[PKPaymentSummaryItem summaryItemWithLabel:label amount:total]];
    self.controller = [[PKPaymentAuthorizationViewController alloc] initWithPaymentRequest:request];
    if (!self.controller) { [self finish:@"Failed"]; return; }
    self.controller.delegate = self;
    [parent presentViewController:self.controller animated:YES completion:nil];
}

- (void)paymentAuthorizationViewController:(PKPaymentAuthorizationViewController *)controller
                     didAuthorizePayment:(PKPayment *)payment
                                 handler:(void (^)(PKPaymentAuthorizationResult *))handler {
    // Do not parse, re-encode, log, or expose any plaintext payment/contact fields.
    // Only Apple's encrypted UTF-8 paymentData crosses the bridge.
    if (self.authorized) {
        handler([[PKPaymentAuthorizationResult alloc] initWithStatus:PKPaymentAuthorizationStatusFailure errors:nil]);
        return;
    }
    self.encryptedPayload = [[NSString alloc] initWithData:payment.token.paymentData encoding:NSUTF8StringEncoding];
    self.authorized = self.encryptedPayload.length > 0;
    // This authorizes capture only. The RN flow reports saved success after /wallets VERIFIED.
    handler([[PKPaymentAuthorizationResult alloc] initWithStatus:self.authorized ? PKPaymentAuthorizationStatusSuccess : PKPaymentAuthorizationStatusFailure errors:nil]);
}

- (void)paymentAuthorizationViewControllerDidFinish:(PKPaymentAuthorizationViewController *)controller {
    NSString *status = self.authorized ? @"Success" : @"Aborted";
    [controller dismissViewControllerAnimated:YES completion:^{ [self finish:status]; }];
}

- (void)finish:(NSString *)status {
    void (^callback)(NSString *, NSString *) = self.completion;
    self.completion = nil;
    NSString *payload = self.encryptedPayload;
    self.encryptedPayload = nil;
    self.controller.delegate = nil;
    self.controller = nil;
    if (callback) callback(status, payload);
}
@end
