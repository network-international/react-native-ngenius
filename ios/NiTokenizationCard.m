#import "NiTokenizationCard.h"

@interface NiTokenizationCard () <NSURLSessionTaskDelegate>
@property (nonatomic, copy) NSString *requestId;
@property (nonatomic, copy) void (^ready)(NSString *);
@property (nonatomic, copy) void (^result)(NSString *, NSDictionary *);
@property (nonatomic, strong) NSDictionary *config;
@property (nonatomic, strong) UINavigationController *navigation;
@property (nonatomic, strong) UITextField *pan;
@property (nonatomic, strong) UITextField *expiry;
@property (nonatomic, strong) UITextField *cvv;
@property (nonatomic, strong) UITextField *holder;
@property (nonatomic, strong) UILabel *error;
@property (nonatomic, strong) UIButton *submitButton;
@property (nonatomic, strong) NSDictionary *card;
// Native-only transport injection for XCTest; never read from bridge options.
@property (nonatomic, strong) NSURLSessionConfiguration *sessionConfiguration;
@property (nonatomic, strong) NSURLSession *session;
@property (nonatomic, strong) NSURLSessionDataTask *task;
@property (nonatomic) BOOL prepared;
@property (nonatomic) BOOL sent;
@property (nonatomic) BOOL finished;
@end

@implementation NiTokenizationCard
- (instancetype)initWithConfig:(NSDictionary *)config ready:(void (^)(NSString *))ready
                       result:(void (^)(NSString *, NSDictionary *))result {
    if ((self = [super init])) {
        _config = config;
        _requestId = [config[@"requestId"] isKindOfClass:NSString.class] ? config[@"requestId"] : @"";
        _ready = [ready copy]; _result = [result copy];
        [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(cancel)
                                                     name:UIApplicationDidEnterBackgroundNotification object:nil];
    }
    return self;
}
- (void)dealloc { [[NSNotificationCenter defaultCenter] removeObserver:self]; }

static UIColor *NICardColor(id value, UIColor *fallback) {
    if (![value isKindOfClass:NSString.class] || ![value hasPrefix:@"#"] || [value length] != 7) return fallback;
    unsigned rgb = 0;
    if (![[NSScanner scannerWithString:[value substringFromIndex:1]] scanHexInt:&rgb]) return fallback;
    return [UIColor colorWithRed:((rgb >> 16) & 255) / 255.0 green:((rgb >> 8) & 255) / 255.0 blue:(rgb & 255) / 255.0 alpha:1];
}
- (UITextField *)field:(NSString *)label secret:(BOOL)secret numeric:(BOOL)numeric stack:(UIStackView *)stack {
    UILabel *title = [UILabel new]; title.text = label;
    title.textColor = NICardColor(self.config[@"colors"][@"payPageLabelColor"], UIColor.labelColor);
    [stack addArrangedSubview:title];
    UITextField *field = [UITextField new]; field.borderStyle = UITextBorderStyleRoundedRect;
    field.accessibilityLabel = label; field.secureTextEntry = secret;
    field.autocorrectionType = UITextAutocorrectionTypeNo; field.spellCheckingType = UITextSpellCheckingTypeNo;
    field.keyboardType = numeric ? UIKeyboardTypeNumberPad : UIKeyboardTypeDefault;
    field.textContentType = @"";
    field.textColor = NICardColor(self.config[@"colors"][@"payPageLabelColor"], UIColor.labelColor);
    [field.heightAnchor constraintGreaterThanOrEqualToConstant:44].active = YES;
    UIToolbar *toolbar = [UIToolbar new]; [toolbar sizeToFit];
    toolbar.items = @[[[UIBarButtonItem alloc] initWithBarButtonSystemItem:UIBarButtonSystemItemFlexibleSpace target:nil action:nil],
                      [[UIBarButtonItem alloc] initWithBarButtonSystemItem:UIBarButtonSystemItemDone target:field action:@selector(resignFirstResponder)]];
    field.inputAccessoryView = toolbar;
    [stack addArrangedSubview:field]; return field;
}
- (void)presentFrom:(UIViewController *)parent {
    if (!parent || !parent.view.window || parent.presentedViewController || self.requestId.length == 0) { [self fail]; return; }
    NSDictionary *labels = self.config[@"labels"] ?: @{};
    UIViewController *controller = [UIViewController new];
    controller.title = labels[@"title"] ?: @"Add Card";
    controller.view.backgroundColor = NICardColor(self.config[@"colors"][@"payPageBackgroundColor"], UIColor.systemBackgroundColor);
    controller.view.semanticContentAttribute = [self.config[@"rtl"] boolValue] ? UISemanticContentAttributeForceRightToLeft : UISemanticContentAttributeForceLeftToRight;
    UIScrollView *scroll = [UIScrollView new]; scroll.translatesAutoresizingMaskIntoConstraints = NO;
    scroll.keyboardDismissMode = UIScrollViewKeyboardDismissModeOnDrag;
    [controller.view addSubview:scroll];
    UIStackView *stack = [UIStackView new]; stack.translatesAutoresizingMaskIntoConstraints = NO;
    stack.axis = UILayoutConstraintAxisVertical; stack.spacing = 12;
    [scroll addSubview:stack];
    [NSLayoutConstraint activateConstraints:@[
        [scroll.leadingAnchor constraintEqualToAnchor:controller.view.safeAreaLayoutGuide.leadingAnchor],
        [scroll.trailingAnchor constraintEqualToAnchor:controller.view.safeAreaLayoutGuide.trailingAnchor],
        [scroll.topAnchor constraintEqualToAnchor:controller.view.safeAreaLayoutGuide.topAnchor],
        [scroll.bottomAnchor constraintEqualToAnchor:controller.view.keyboardLayoutGuide.topAnchor],
        [stack.leadingAnchor constraintEqualToAnchor:scroll.contentLayoutGuide.leadingAnchor constant:24],
        [stack.trailingAnchor constraintEqualToAnchor:scroll.contentLayoutGuide.trailingAnchor constant:-24],
        [stack.topAnchor constraintEqualToAnchor:scroll.contentLayoutGuide.topAnchor constant:24],
        [stack.bottomAnchor constraintEqualToAnchor:scroll.contentLayoutGuide.bottomAnchor constant:-24],
        [stack.widthAnchor constraintEqualToAnchor:scroll.frameLayoutGuide.widthAnchor constant:-48]
    ]];
    self.pan = [self field:labels[@"pan"] ?: @"Card number" secret:YES numeric:YES stack:stack];
    self.expiry = [self field:labels[@"expiry"] ?: @"Expiry (MM/YY)" secret:NO numeric:NO stack:stack];
    self.cvv = [self field:labels[@"cvv"] ?: @"Security code" secret:YES numeric:YES stack:stack];
    self.holder = [self field:labels[@"name"] ?: @"Cardholder name" secret:NO numeric:NO stack:stack];
    self.error = [UILabel new]; self.error.numberOfLines = 0; self.error.textColor = UIColor.systemRedColor;
    [stack addArrangedSubview:self.error];
    self.submitButton = [UIButton buttonWithType:UIButtonTypeSystem];
    [self.submitButton setTitle:labels[@"submit"] ?: @"Add Card" forState:UIControlStateNormal];
    self.submitButton.backgroundColor = NICardColor(self.config[@"colors"][@"payButtonBackgroundColor"], UIColor.systemYellowColor);
    [self.submitButton setTitleColor:NICardColor(self.config[@"colors"][@"payButtonTitleColor"], UIColor.blackColor) forState:UIControlStateNormal];
    [self.submitButton.heightAnchor constraintEqualToConstant:50].active = YES;
    [self.submitButton addTarget:self action:@selector(prepare) forControlEvents:UIControlEventTouchUpInside];
    [stack addArrangedSubview:self.submitButton];
    controller.navigationItem.rightBarButtonItem = [[UIBarButtonItem alloc] initWithTitle:labels[@"cancel"] ?: @"Cancel" style:UIBarButtonItemStylePlain target:self action:@selector(cancel)];
    self.navigation = [[UINavigationController alloc] initWithRootViewController:controller];
    self.navigation.modalPresentationStyle = UIModalPresentationFullScreen;
    self.navigation.modalInPresentation = YES;
    [parent presentViewController:self.navigation animated:YES completion:nil];
}
static BOOL NICardMatch(NSString *value, NSString *pattern) {
    return [[NSPredicate predicateWithFormat:@"SELF MATCHES %@", pattern] evaluateWithObject:value ?: @""];
}
- (void)prepare {
    if (self.prepared || self.finished) return;
    NSString *pan = [[self.pan.text stringByReplacingOccurrencesOfString:@" " withString:@""] stringByReplacingOccurrencesOfString:@"-" withString:@""];
    BOOL valid = NICardMatch(pan, @"[0-9]{13,19}");
    NSInteger sum = 0; BOOL doubled = NO;
    for (NSInteger i = pan.length - 1; valid && i >= 0; i--) {
        NSInteger digit = [pan characterAtIndex:i] - '0';
        if (doubled) { digit *= 2; if (digit > 9) digit -= 9; }
        sum += digit; doubled = !doubled;
    }
    valid = valid && sum > 0 && sum % 10 == 0;
    NSString *expiry = [self.expiry.text stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
    NSInteger month = 0, year = 0;
    if (NICardMatch(expiry, @"[0-9]{2}/[0-9]{2}")) { month = [[expiry substringToIndex:2] integerValue]; year = 2000 + [[expiry substringFromIndex:3] integerValue]; }
    if (NICardMatch(expiry, @"[0-9]{4}-[0-9]{2}")) { year = [[expiry substringToIndex:4] integerValue]; month = [[expiry substringFromIndex:5] integerValue]; }
    NSCalendar *calendar = [[NSCalendar alloc] initWithCalendarIdentifier:NSCalendarIdentifierGregorian];
    NSDateComponents *now = [calendar components:NSCalendarUnitYear | NSCalendarUnitMonth fromDate:NSDate.date];
    valid = valid && month >= 1 && month <= 12 && (year > now.year || (year == now.year && month >= now.month));
    NSString *cvvPattern = [pan hasPrefix:@"34"] || [pan hasPrefix:@"37"] ? @"[0-9]{4}" : @"[0-9]{3}";
    NSString *holder = [self.holder.text stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
    valid = valid && NICardMatch(self.cvv.text, cvvPattern) && holder.length > 0 && holder.length <= 100;
    if (!valid) { self.error.text = self.config[@"labels"][@"invalid"] ?: @"Check card details"; return; }
    self.card = @{ @"pan": pan, @"expiry": [NSString stringWithFormat:@"%04ld-%02ld", (long)year, (long)month], @"cvv": self.cvv.text, @"cardholderName": holder };
    self.prepared = YES; self.error.text = nil;
    for (UITextField *field in @[self.pan, self.expiry, self.cvv, self.holder]) field.enabled = NO;
    self.submitButton.enabled = NO; [self.navigation.view endEditing:YES];
    if (self.ready) self.ready(self.requestId);
    self.ready = nil;
}
- (void)submit:(NSDictionary *)options {
    if (self.finished || self.sent || !self.card) return;
    NSString *url = options[@"url"], *token = options[@"accessToken"];
    NSURLComponents *components = [url isKindOfClass:NSString.class] ? [NSURLComponents componentsWithString:url] : nil;
    BOOL safeURL = [components.scheme.lowercaseString isEqualToString:@"https"] && components.host.length > 0 && !components.user && !components.password && !components.query && !components.fragment && NICardMatch(components.percentEncodedPath, @".*/api/outlets/[^/]+/cards");
    if (!safeURL || ![token isKindOfClass:NSString.class] || token.length == 0 ||
        [token rangeOfCharacterFromSet:NSCharacterSet.newlineCharacterSet].location != NSNotFound ||
        ![options[@"consentData"] isKindOfClass:NSDictionary.class]) { [self fail]; return; }
    self.sent = YES;
    NSData *payload = [NSJSONSerialization dataWithJSONObject:@{ @"card": self.card, @"consentData": options[@"consentData"] } options:0 error:nil];
    self.card = nil; [self clearFields];
    if (!payload) { [self fail]; return; }
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:components.URL];
    request.HTTPMethod = @"POST"; request.HTTPBody = payload; request.timeoutInterval = 30;
    [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
    [request setValue:token forHTTPHeaderField:@"Access-Token"];
    NSURLSessionConfiguration *config = [self.sessionConfiguration copy] ?: NSURLSessionConfiguration.ephemeralSessionConfiguration;
    config.URLCache = nil; config.URLCredentialStorage = nil; config.HTTPCookieStorage = nil;
    config.HTTPCookieAcceptPolicy = NSHTTPCookieAcceptPolicyNever;
    config.requestCachePolicy = NSURLRequestReloadIgnoringLocalCacheData;
    self.session = [NSURLSession sessionWithConfiguration:config delegate:self delegateQueue:nil];
    self.task = [self.session dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        NSDictionary *safe = nil;
        NSInteger status = [response isKindOfClass:NSHTTPURLResponse.class] ? ((NSHTTPURLResponse *)response).statusCode : 0;
        if (!error && status >= 200 && status < 300 && data.length <= 65536) {
            id body = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
            if ([body isKindOfClass:NSDictionary.class]) safe = [self safeResponse:body];
        }
        dispatch_async(dispatch_get_main_queue(), ^{ [self finish:safe ? @"Response" : @"Failed" response:safe]; });
    }];
    [self.task resume];
}
- (NSDictionary *)safeResponse:(NSDictionary *)body {
    NSMutableDictionary *safe = [NSMutableDictionary new];
    for (NSString *key in @[@"tokenRef", @"type", @"status", @"walletType"]) if ([body[key] isKindOfClass:NSString.class]) safe[key] = body[key];
    if ([body[@"cardDetails"] isKindOfClass:NSDictionary.class]) {
        NSMutableDictionary *details = [NSMutableDictionary new];
        for (NSString *key in @[@"scheme", @"last4", @"expiry"]) if ([body[@"cardDetails"][key] isKindOfClass:NSString.class]) details[key] = body[@"cardDetails"][key];
        safe[@"cardDetails"] = details;
    }
    return safe;
}
- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task willPerformHTTPRedirection:(NSHTTPURLResponse *)response newRequest:(NSURLRequest *)request completionHandler:(void (^)(NSURLRequest *))completionHandler {
    completionHandler(nil);
}
- (void)clearFields { self.pan.text = nil; self.cvv.text = nil; self.expiry.text = nil; self.holder.text = nil; }
- (void)cancel { [self finish:@"Aborted" response:nil]; }
- (void)fail { [self finish:@"Failed" response:nil]; }
- (void)finish:(NSString *)status response:(NSDictionary *)response {
    if (self.finished) return;
    self.finished = YES; self.ready = nil; self.card = nil; [self clearFields];
    [self.task cancel]; self.task = nil; [self.session invalidateAndCancel]; self.session = nil;
    void (^callback)(NSString *, NSDictionary *) = self.result; self.result = nil;
    if (self.navigation.presentingViewController) [self.navigation dismissViewControllerAnimated:YES completion:^{ if (callback) callback(status, response ?: @{}); }];
    else if (callback) callback(status, response ?: @{});
}
@end
