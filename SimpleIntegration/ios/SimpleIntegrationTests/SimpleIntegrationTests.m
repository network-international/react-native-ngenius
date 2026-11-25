#import <UIKit/UIKit.h>
#import <XCTest/XCTest.h>

#import <React/RCTLog.h>
#import <React/RCTRootView.h>

#define TIMEOUT_SECONDS 600
#define TEXT_TO_LOOK_FOR @"Welcome to React"

// The production card form and POST stay native. A local URLProtocol substitutes
// the transport in these tests; no card fixture or credential is sent to a server.
@interface NiTokenizationCard : NSObject
- (instancetype)initWithConfig:(NSDictionary *)config ready:(void (^)(NSString *))ready result:(void (^)(NSString *, NSDictionary *))result;
- (void)presentFrom:(UIViewController *)parent;
- (void)submit:(NSDictionary *)request;
- (void)prepare;
- (void)cancel;
@end
static NSDictionary *cardTestBody;
static NSString *cardTestPath;
static NSString *cardTestMethod;
static NSInteger cardTestStatus;
static NSInteger cardTestRequestCount;
static NSUInteger cardTestTokenCount;
static NSUInteger cardTestResponseBytes;
static NSString *cardTestListKey;
@interface NativeCardStubProtocol : NSURLProtocol
@end
@implementation NativeCardStubProtocol
+ (BOOL)canInitWithRequest:(NSURLRequest *)request { return [request.URL.host isEqualToString:@"native-card.test"]; }
+ (NSURLRequest *)canonicalRequestForRequest:(NSURLRequest *)request { return request; }
- (void)startLoading {
    cardTestRequestCount += 1;
    cardTestPath = self.request.URL.path;
    cardTestMethod = self.request.HTTPMethod;
    NSData *body = self.request.HTTPBody;
    if (!body && self.request.HTTPBodyStream) {
        NSInputStream *stream = self.request.HTTPBodyStream;
        [stream open]; NSMutableData *data = [NSMutableData new]; uint8_t bytes[4096]; NSInteger count;
        while ((count = [stream read:bytes maxLength:sizeof(bytes)]) > 0) [data appendBytes:bytes length:count];
        [stream close]; body = data;
    }
    cardTestBody = body ? [NSJSONSerialization JSONObjectWithData:body options:0 error:nil] : nil;
    NSDictionary *response;
    if (cardTestStatus == 200) {
        NSMutableArray *tokens = [NSMutableArray arrayWithObject:@{
            @"tokenRef": @"fixture-card", @"type": @"CARD", @"status": @"VERIFIED",
            @"cardDetails": @{ @"scheme": @"VISA", @"last4": @"1111", @"expiry": @"2099-12",
                               @"pan": cardTestBody[@"card"][@"pan"] ?: @"" }
        }];
        for (NSUInteger i = 2; i < cardTestTokenCount; i++) {
            NSString *reference = [NSString stringWithFormat:@"00000000-0000-4000-8000-%012lu", (unsigned long)i];
            [tokens addObject:@{
                @"tokenRef": reference, @"type": @"CARD", @"status": @"VERIFIED",
                @"cardDetails": @{ @"scheme": @"VISA", @"last4": @"1111", @"expiry": @"2099-12" }
            }];
        }
        [tokens addObject:@{
            @"tokenRef": @"fixture-wallet", @"type": @"WALLET", @"walletType": @"GOOGLE_PAY",
            @"status": @"AWAIT_3DS", @"cvv": cardTestBody[@"card"][@"cvv"] ?: @""
        }];
        response = @{
            (cardTestListKey ?: @"advisedTokens"): tokens,
            @"tncUrl": @"https://terms.test/terms",
            @"page": @{ @"number": @0, @"size": @(tokens.count), @"totalElements": @(tokens.count),
                        @"totalPages": @1, @"private": @"fixture" },
            @"card": cardTestBody[@"card"] ?: @{}
        };
    } else {
        response = @{ @"message": @"private fixture error", @"card": cardTestBody[@"card"] ?: @{} };
    }
    NSData *data = [NSJSONSerialization dataWithJSONObject:response options:0 error:nil];
    cardTestResponseBytes = data.length;
    NSHTTPURLResponse *http = [[NSHTTPURLResponse alloc] initWithURL:self.request.URL statusCode:cardTestStatus HTTPVersion:@"HTTP/1.1" headerFields:@{@"Content-Type": @"application/json"}];
    [self.client URLProtocol:self didReceiveResponse:http cacheStoragePolicy:NSURLCacheStorageNotAllowed];
    [self.client URLProtocol:self didLoadData:data]; [self.client URLProtocolDidFinishLoading:self];
}
- (void)stopLoading { }
@end

@interface SimpleIntegrationTests : XCTestCase

@end

@implementation SimpleIntegrationTests

- (BOOL)findSubviewInView:(UIView *)view matching:(BOOL (^)(UIView *view))test
{
  if (test(view)) {
    return YES;
  }
  for (UIView *subview in [view subviews]) {
    if ([self findSubviewInView:subview matching:test]) {
      return YES;
    }
  }
  return NO;
}

- (void)testRendersWelcomeScreen
{
  UIViewController *vc = [[[RCTSharedApplication() delegate] window] rootViewController];
  NSDate *date = [NSDate dateWithTimeIntervalSinceNow:TIMEOUT_SECONDS];
  BOOL foundElement = NO;

  __block NSString *redboxError = nil;
#ifdef DEBUG
  RCTSetLogFunction(
      ^(RCTLogLevel level, RCTLogSource source, NSString *fileName, NSNumber *lineNumber, NSString *message) {
        if (level >= RCTLogLevelError) {
          redboxError = message;
        }
      });
#endif

  while ([date timeIntervalSinceNow] > 0 && !foundElement && !redboxError) {
    [[NSRunLoop mainRunLoop] runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.1]];
    [[NSRunLoop mainRunLoop] runMode:NSRunLoopCommonModes beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.1]];

    foundElement = [self findSubviewInView:vc.view
                                  matching:^BOOL(UIView *view) {
                                    if ([view.accessibilityLabel isEqualToString:TEXT_TO_LOOK_FOR]) {
                                      return YES;
                                    }
                                    return NO;
                                  }];
  }

#ifdef DEBUG
  RCTSetLogFunction(RCTDefaultLogFunction);
#endif

  XCTAssertNil(redboxError, @"RedBox error: %@", redboxError);
  XCTAssertTrue(foundElement, @"Couldn't find element with text '%@' in %d seconds", TEXT_TO_LOOK_FOR, TIMEOUT_SECONDS);
}


- (void)runNativeCardWithStatus:(NSInteger)status cancel:(BOOL)cancel usageType:(NSString *)usageType tokenCount:(NSUInteger)tokenCount {
    cardTestBody = nil; cardTestStatus = status; cardTestRequestCount = 0;
    cardTestPath = nil; cardTestMethod = nil;
    cardTestTokenCount = tokenCount; cardTestResponseBytes = 0;
    NSString *testPAN = [@"4" stringByPaddingToLength:16 withString:@"1" startingAtIndex:0];
    BOOL validUsageType = [usageType isEqualToString:@"ONCE_OFF"] || [usageType isEqualToString:@"PERMANENT"];
    XCTestExpectation *done = [self expectationWithDescription:@"Native Card result"];
    dispatch_async(dispatch_get_main_queue(), ^{
        UIViewController *parent = [[UIApplication.sharedApplication.delegate window] rootViewController];
        __block NiTokenizationCard *card;
        NSDictionary *consent = @{
            @"status": @"NOT_COLLECTED", @"skippedByMerchant": @YES,
            @"clientTimestamp": @"2026-10-26T06:15:30.000Z", @"channel": @"REACT_NATIVE",
            @"sdk": @{ @"name": @"react-native-ngenius", @"version": @"3.2.9" },
            @"device": @{ @"platform": @"IOS", @"osVersion": @"26.0", @"timezoneOffsetMinutes": @0 }
        };
        card = [[NiTokenizationCard alloc] initWithConfig:@{
            @"requestId": @"native-fixture", @"labels": @{}, @"acceptedSchemes": @[@"Visa"]
        }
          ready:^(NSString *requestId) {
            XCTAssertTrue([requestId isEqualToString:@"native-fixture"]);
            NSMutableDictionary *request = [@{
                @"url": @"https://native-card.test/api/outlets/outlet/payment-tokenization-sessions/session-1/cards",
                @"accessToken": @"fixture-access",
                @"sessionRef": @"session-1",
                @"consentData": consent
            } mutableCopy];
            if (usageType) request[@"usageType"] = usageType;
            [card submit:request];
          } result:^(NSString *result, NSDictionary *response) {
            if (cancel) {
                XCTAssertTrue([result isEqualToString:@"Aborted"]); XCTAssertNil(cardTestBody);
            } else if (!validUsageType) {
                XCTAssertEqualObjects(result, @"Failed");
                XCTAssertEqual(response.count, 0);
                XCTAssertNil(cardTestBody);
            } else {
                XCTAssertEqualObjects(cardTestPath, @"/api/outlets/outlet/payment-tokenization-sessions/session-1/cards");
                XCTAssertEqualObjects(cardTestMethod, @"POST");
                XCTAssertEqualObjects(cardTestBody[@"usageType"], usageType);
                XCTAssertNil(cardTestBody[@"sessionRef"]);
                XCTAssertTrue([cardTestBody[@"consentData"] isEqual:consent]);
                XCTAssertTrue([cardTestBody[@"card"] isKindOfClass:NSDictionary.class]);
                XCTAssertTrue([cardTestBody[@"card"] count] == 4);
                XCTAssertEqualObjects(cardTestBody[@"card"][@"pan"], testPAN);
                XCTAssertEqualObjects(cardTestBody[@"card"][@"expiry"], @"2099-12");
                if (status == 200) {
                    XCTAssertTrue([result isEqualToString:@"Response"]);
                    NSArray<NSDictionary *> *tokens = response[@"tokens"];
                    XCTAssertNil(response[@"advisedTokens"]);
                    XCTAssertEqual(tokens.count, tokenCount);
                    if (tokenCount > 2) XCTAssertGreaterThan(cardTestResponseBytes, 64 * 1024);
                    XCTAssertEqualObjects(tokens.firstObject[@"status"], @"VERIFIED");
                    XCTAssertEqualObjects(tokens.lastObject[@"status"], @"AWAIT_3DS");
                    XCTAssertEqualObjects(response[@"tncUrl"], @"https://terms.test/terms");
                    XCTAssertEqualObjects(response[@"page"][@"totalElements"], @(tokenCount));
                    XCTAssertNil(response[@"page"][@"private"]);
                    XCTAssertNil(response[@"card"]);
                    XCTAssertNil(tokens.firstObject[@"cardDetails"][@"pan"]);
                    XCTAssertNil(tokens.lastObject[@"cvv"]);
                } else {
                    XCTAssertEqualObjects(result, @"Failed");
                    XCTAssertEqualObjects(response, (@{ @"httpStatus": @(status) }));
                }
            }
            XCTAssertTrue([[(UITextField *)[card valueForKey:@"pan"] text] length] == 0);
            XCTAssertNil([card valueForKey:@"panDigits"]);
            XCTAssertTrue([[(UITextField *)[card valueForKey:@"cvv"] text] length] == 0);
            XCTAssertFalse([(UIActivityIndicatorView *)[card valueForKey:@"activityIndicator"] isAnimating]);
            XCTAssertTrue([(UIView *)[card valueForKey:@"activityIndicator"] isHidden]);
            cardTestBody = nil; card = nil; [done fulfill];
          }];
        NSURLSessionConfiguration *transport = NSURLSessionConfiguration.ephemeralSessionConfiguration;
        transport.protocolClasses = @[NativeCardStubProtocol.class];
        [card setValue:transport forKey:@"sessionConfiguration"];
        [card presentFrom:parent];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.6 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            UITextField *pan = [card valueForKey:@"pan"];
            UITextField *cvv = [card valueForKey:@"cvv"];
            UITextField *expiry = [card valueForKey:@"expiry"];
            UITextField *holder = [card valueForKey:@"holder"];
            UIView *cardDetails = [card valueForKey:@"cardDetails"];
            XCTAssertTrue([pan isDescendantOfView:cardDetails]);
            XCTAssertTrue([expiry isDescendantOfView:cardDetails]);
            XCTAssertTrue([cvv isDescendantOfView:cardDetails]);
            XCTAssertFalse([holder isDescendantOfView:cardDetails]);
            CGRect panFrame = [pan convertRect:pan.bounds toView:cardDetails];
            CGRect expiryFrame = [expiry convertRect:expiry.bounds toView:cardDetails];
            CGRect cvvFrame = [cvv convertRect:cvv.bounds toView:cardDetails];
            XCTAssertGreaterThan(CGRectGetMinY(expiryFrame), CGRectGetMaxY(panFrame));
            if (!UIContentSizeCategoryIsAccessibilityCategory(cardDetails.traitCollection.preferredContentSizeCategory)) {
                XCTAssertEqualWithAccuracy(CGRectGetMinY(expiryFrame), CGRectGetMinY(cvvFrame), 1);
                XCTAssertGreaterThan(CGRectGetWidth(panFrame), CGRectGetWidth(expiryFrame));
            }
            XCTAssertNotNil(cvv.rightView);
            XCTAssertTrue(cvv.secureTextEntry);
            XCTAssertEqualObjects(pan.placeholder, @"•••• •••• •••• 1234");
            XCTAssertEqualObjects(expiry.placeholder, @"MM/YY");
            XCTAssertEqualObjects(cvv.placeholder, @"123");
            XCTAssertEqualObjects(holder.placeholder, @"Enter name on card");
            XCTAssertFalse([(UIActivityIndicatorView *)[card valueForKey:@"activityIndicator"] isAnimating]);
            XCTAssertTrue([(UIView *)[card valueForKey:@"activityIndicator"] isHidden]);
            if (cancel) { [card cancel]; return; }
            UIImageView *schemeIcon = [card valueForKey:@"schemeIcon"];
            XCTAssertEqual(schemeIcon.superview, pan.rightView);
            UIImage *genericSchemeImage = schemeIcon.image;
            for (NSArray<NSString *> *example in @[
                @[@"4", @""], @[@"407197", @"mada"], @[@"66900901", @"Jaywan"],
                @[@"62212", @"Discover"], @[@"62235", @"Discover"],
                @[@"62123", @""], @[@"621234", @"UnionPay"]
            ]) {
                [pan.delegate textField:pan shouldChangeCharactersInRange:NSMakeRange(0, pan.text.length)
                        replacementString:example[0]];
                XCTAssertEqualObjects(pan.accessibilityHint ?: @"", example[1]);
            }
            [pan.delegate textField:pan shouldChangeCharactersInRange:NSMakeRange(0, pan.text.length) replacementString:@""];
            [pan.delegate textField:pan shouldChangeCharactersInRange:NSMakeRange(0, 0) replacementString:[testPAN substringToIndex:2]];
            XCTAssertEqualObjects(pan.text, @"••");
            XCTAssertEqualObjects(pan.accessibilityHint, @"Visa");
            XCTAssertNotEqual(schemeIcon.image, genericSchemeImage);
            XCTAssertFalse([pan canPerformAction:@selector(copy:) withSender:nil]);
            [pan.delegate textField:pan shouldChangeCharactersInRange:NSMakeRange(2, 0) replacementString:[testPAN substringFromIndex:2]];
            XCTAssertEqualObjects(pan.text, @"•••• •••• •••• ••••");
            [pan.delegate textField:pan shouldChangeCharactersInRange:NSMakeRange(4, 1) replacementString:@""];
            XCTAssertEqualObjects(pan.text, @"•••• •••• •••• •••");
            [pan.delegate textField:pan shouldChangeCharactersInRange:NSMakeRange(0, pan.text.length)
                    replacementString:[NSString stringWithFormat:@"%@ %@ %@", [testPAN substringToIndex:4],
                                       [testPAN substringWithRange:NSMakeRange(4, 4)], [testPAN substringFromIndex:8]]];
            cvv.text = [NSString stringWithFormat:@"%d", 100 + 20 + 3];
            [expiry.delegate textField:expiry shouldChangeCharactersInRange:NSMakeRange(0, 0) replacementString:@"1299"];
            XCTAssertEqualObjects(expiry.text, @"12/99");
            holder.text = @"QA Test";
            [card prepare];
            if (validUsageType) {
                XCTAssertTrue([(UIActivityIndicatorView *)[card valueForKey:@"activityIndicator"] isAnimating]);
                UIActivityIndicatorView *spinner = [card valueForKey:@"activityIndicator"];
                UIButton *pay = [card valueForKey:@"submitButton"];
                XCTAssertFalse(spinner.isHidden);
                XCTAssertEqual(spinner.superview, pay);
                XCTAssertFalse(pay.isEnabled);
            }
        });
    });
    [self waitForExpectations:@[done] timeout:20];
    XCTAssertEqual(cardTestRequestCount, !cancel && validUsageType ? 1 : 0);
}
- (void)testNativeCardVerifiedRequestAndSafeBridgeResponse { [self runNativeCardWithStatus:200 cancel:NO usageType:@"PERMANENT" tokenCount:2]; }

- (void)testNativeCardShowsGroupedDigitsWhenMaskingIsOff {
    XCTestExpectation *done = [self expectationWithDescription:@"Card number visibility"];
    dispatch_async(dispatch_get_main_queue(), ^{
        UIViewController *parent = [[UIApplication.sharedApplication.delegate window] rootViewController];
        NiTokenizationCard *card = [[NiTokenizationCard alloc] initWithConfig:@{
            @"requestId": @"pan-visibility-fixture", @"maskPaymentInfo": @NO
        }
            ready:^(NSString *requestId) { XCTFail(@"This test only edits the card form"); }
            result:^(NSString *result, NSDictionary *response) { XCTAssertEqualObjects(result, @"Aborted"); [done fulfill]; }];
        [card presentFrom:parent];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.6 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            UITextField *pan = [card valueForKey:@"pan"];
            [pan.delegate textField:pan shouldChangeCharactersInRange:NSMakeRange(0, 0) replacementString:@"4242424242424242"];
            XCTAssertEqualObjects(pan.text, @"4242 4242 4242 4242");
            [pan.delegate textField:pan shouldChangeCharactersInRange:NSMakeRange(4, 1) replacementString:@""];
            XCTAssertEqualObjects(pan.text, @"4244 2424 2424 242");
            XCTAssertFalse([pan canPerformAction:@selector(copy:) withSender:nil]);
            XCTAssertTrue([(UITextField *)[card valueForKey:@"cvv"] isSecureTextEntry]);
            [card cancel];
        });
    });
    [self waitForExpectations:@[done] timeout:10];
}
- (void)testNativeCardErrorDoesNotExposeResponseBody { [self runNativeCardWithStatus:401 cancel:NO usageType:@"ONCE_OFF" tokenCount:2]; }
- (void)testNativeCardCancelClearsFieldsWithoutSubmitting { [self runNativeCardWithStatus:200 cancel:YES usageType:@"PERMANENT" tokenCount:2]; }
- (void)testNativeCardRejectsMissingUsageType { [self runNativeCardWithStatus:200 cancel:NO usageType:nil tokenCount:2]; }
- (void)testNativeCardRejectsInvalidUsageType { [self runNativeCardWithStatus:200 cancel:NO usageType:@"INVALID" tokenCount:2]; }

- (void)testNativeCardAcceptsAnUpdatedListBeyondTheOldSingleTokenLimit {
    [self runNativeCardWithStatus:200 cancel:NO usageType:@"PERMANENT" tokenCount:460];
}

- (void)testNativeCardReadsTheEarlierTokensFieldWhenAdvisedTokensIsAbsent {
    cardTestListKey = @"tokens";
    [self runNativeCardWithStatus:200 cancel:NO usageType:@"PERMANENT" tokenCount:2];
    cardTestListKey = nil;
}

- (void)runNativeCardBackWithRtl:(BOOL)rtl {
    cardTestBody = nil; cardTestStatus = 200; cardTestRequestCount = 0;
    XCTestExpectation *done = [self expectationWithDescription:@"Native Card visible Back result"];
    __block NSInteger resultCount = 0;
    __block NSInteger readyCount = 0;
    dispatch_async(dispatch_get_main_queue(), ^{
        UIViewController *parent = [[UIApplication.sharedApplication.delegate window] rootViewController];
        NSString *backLabel = rtl ? @"رجوع" : @"Retour";
        CGFloat measuredHeight = round(0.61 * parent.view.bounds.size.height);
        __block NiTokenizationCard *card;
        card = [[NiTokenizationCard alloc] initWithConfig:@{
            @"requestId": @"native-back-fixture", @"rtl": @(rtl), @"mode": rtl ? @"fullscreen" : @"bottomSheet",
            @"sheetHeight": @(measuredHeight), @"sheetHeightFraction": @0.64, @"sheetMaxWidth": @560,
            @"labels": @{ @"back": backLabel, @"processing": @"Saving fixture" }
        } ready:^(NSString *requestId) {
            readyCount += 1;
        } result:^(NSString *result, NSDictionary *response) {
            resultCount += 1;
            XCTAssertTrue([result isEqualToString:@"Aborted"]);
            XCTAssertEqual(response.count, 0);
            for (NSString *key in @[@"pan", @"expiry", @"cvv", @"holder"]) {
                XCTAssertEqual([[(UITextField *)[card valueForKey:key] text] length], 0);
            }
            XCTAssertFalse([(UIActivityIndicatorView *)[card valueForKey:@"activityIndicator"] isAnimating]);
            XCTAssertTrue([(UIView *)[card valueForKey:@"activityIndicator"] isHidden]);
            XCTAssertNil(parent.presentedViewController);
            card = nil;
            [done fulfill];
        }];
        NSURLSessionConfiguration *transport = NSURLSessionConfiguration.ephemeralSessionConfiguration;
        transport.protocolClasses = @[NativeCardStubProtocol.class];
        [card setValue:transport forKey:@"sessionConfiguration"];
        [card presentFrom:parent];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.6 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            UIViewController *presentation = parent.presentedViewController;
            XCTAssertNotNil(presentation);
            UISemanticContentAttribute expected = rtl ? UISemanticContentAttributeForceRightToLeft : UISemanticContentAttributeForceLeftToRight;
            XCTAssertEqual(presentation.view.semanticContentAttribute, expected);
            UIView *panel = [card valueForKey:@"panel"];
            CGFloat expectedHeight = rtl ? presentation.view.bounds.size.height : measuredHeight;
            XCTAssertEqualWithAccuracy(panel.frame.size.height, expectedHeight, 1);
            UIScrollView *scroll = [card valueForKey:@"scroll"];
            CGRect originalPanelFrame = panel.frame;
            CGRect keyboardInView = presentation.view.bounds;
            keyboardInView.size.height = 240;
            keyboardInView.origin.y = CGRectGetMaxY(presentation.view.bounds) - keyboardInView.size.height;
            CGRect keyboardOnScreen = [presentation.view convertRect:keyboardInView toCoordinateSpace:presentation.view.window.screen.coordinateSpace];
            [NSNotificationCenter.defaultCenter postNotificationName:UIKeyboardDidChangeFrameNotification object:nil
                userInfo:@{ UIKeyboardFrameEndUserInfoKey: [NSValue valueWithCGRect:keyboardOnScreen] }];
            [presentation.view layoutIfNeeded];
            XCTAssertGreaterThan(scroll.contentInset.bottom, 0);
            XCTAssertTrue(CGRectEqualToRect(panel.frame, originalPanelFrame));
            __block UIButton *back = nil;
            [self findSubviewInView:presentation.view matching:^BOOL(UIView *view) {
                if ([view isKindOfClass:UIButton.class] && [view.accessibilityIdentifier isEqualToString:@"tokenization-card-back"]) {
                    back = (UIButton *)view;
                    return YES;
                }
                return NO;
            }];
            XCTAssertNotNil(back);
            XCTAssertEqualObjects(back.accessibilityLabel, backLabel);
            XCTAssertEqual(back.effectiveUserInterfaceLayoutDirection,
                           rtl ? UIUserInterfaceLayoutDirectionRightToLeft : UIUserInterfaceLayoutDirectionLeftToRight);
            XCTAssertTrue(back.bounds.size.width >= 44 && back.bounds.size.height >= 44);
            // Arbitrary native-only text proves Back clears inputs without validation or submission.
            for (NSString *key in @[@"pan", @"expiry", @"cvv", @"holder"]) {
                [(UITextField *)[card valueForKey:key] setText:@"native-only fixture"];
            }
            [back sendActionsForControlEvents:UIControlEventTouchUpInside];
            [back sendActionsForControlEvents:UIControlEventTouchUpInside];
        });
    });
    [self waitForExpectations:@[done] timeout:20];
    XCTAssertEqual(resultCount, 1);
    XCTAssertEqual(readyCount, 0);
    XCTAssertEqual(cardTestRequestCount, 0);
    XCTAssertNil(cardTestBody);
}
- (void)testNativeCardVisibleBackClearsFieldsWithoutSubmitting { [self runNativeCardBackWithRtl:NO]; }
- (void)testNativeCardVisibleBackPreservesRtlAndLocalizedLabel { [self runNativeCardBackWithRtl:YES]; }

@end
