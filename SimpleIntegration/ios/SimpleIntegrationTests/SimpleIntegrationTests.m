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
            @"tokens": tokens,
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
        card = [[NiTokenizationCard alloc] initWithConfig:@{ @"requestId": @"native-fixture", @"labels": @{} }
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
                if (status == 200) {
                    XCTAssertTrue([result isEqualToString:@"Response"]);
                    NSArray<NSDictionary *> *tokens = response[@"tokens"];
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
                } else { XCTAssertTrue([result isEqualToString:@"Failed"]); XCTAssertTrue(response.count == 0); }
            }
            XCTAssertTrue([[(UITextField *)[card valueForKey:@"pan"] text] length] == 0);
            XCTAssertTrue([[(UITextField *)[card valueForKey:@"cvv"] text] length] == 0);
            XCTAssertFalse([(UIActivityIndicatorView *)[card valueForKey:@"activityIndicator"] isAnimating]);
            XCTAssertTrue([(UIView *)[card valueForKey:@"processingView"] isHidden]);
            cardTestBody = nil; card = nil; [done fulfill];
          }];
        NSURLSessionConfiguration *transport = NSURLSessionConfiguration.ephemeralSessionConfiguration;
        transport.protocolClasses = @[NativeCardStubProtocol.class];
        [card setValue:transport forKey:@"sessionConfiguration"];
        [card presentFrom:parent];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.6 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            UITextField *pan = [card valueForKey:@"pan"]; UITextField *cvv = [card valueForKey:@"cvv"];
            XCTAssertTrue(pan.secureTextEntry); XCTAssertTrue(cvv.secureTextEntry);
            XCTAssertFalse([(UIActivityIndicatorView *)[card valueForKey:@"activityIndicator"] isAnimating]);
            XCTAssertTrue([(UIView *)[card valueForKey:@"processingView"] isHidden]);
            if (cancel) { [card cancel]; return; }
            pan.text = [@"4" stringByPaddingToLength:16 withString:@"1" startingAtIndex:0];
            cvv.text = [NSString stringWithFormat:@"%d", 100 + 20 + 3];
            [(UITextField *)[card valueForKey:@"expiry"] setText:@"12/99"];
            [(UITextField *)[card valueForKey:@"holder"] setText:@"QA Test"];
            [card prepare];
            if (validUsageType) {
                XCTAssertTrue([(UIActivityIndicatorView *)[card valueForKey:@"activityIndicator"] isAnimating]);
                XCTAssertFalse([(UIView *)[card valueForKey:@"processingView"] isHidden]);
            }
        });
    });
    [self waitForExpectations:@[done] timeout:20];
    XCTAssertEqual(cardTestRequestCount, !cancel && validUsageType ? 1 : 0);
}
- (void)testNativeCardVerifiedRequestAndSafeBridgeResponse { [self runNativeCardWithStatus:200 cancel:NO usageType:@"PERMANENT" tokenCount:2]; }
- (void)testNativeCardErrorDoesNotExposeResponseBody { [self runNativeCardWithStatus:401 cancel:NO usageType:@"ONCE_OFF" tokenCount:2]; }
- (void)testNativeCardCancelClearsFieldsWithoutSubmitting { [self runNativeCardWithStatus:200 cancel:YES usageType:@"PERMANENT" tokenCount:2]; }
- (void)testNativeCardRejectsMissingUsageType { [self runNativeCardWithStatus:200 cancel:NO usageType:nil tokenCount:2]; }
- (void)testNativeCardRejectsInvalidUsageType { [self runNativeCardWithStatus:200 cancel:NO usageType:@"INVALID" tokenCount:2]; }

- (void)testNativeCardAcceptsAnUpdatedListBeyondTheOldSingleTokenLimit {
    [self runNativeCardWithStatus:200 cancel:NO usageType:@"PERMANENT" tokenCount:460];
}

- (void)runNativeCardBackWithRtl:(BOOL)rtl {
    cardTestBody = nil; cardTestStatus = 200; cardTestRequestCount = 0;
    XCTestExpectation *done = [self expectationWithDescription:@"Native Card visible Back result"];
    __block NSInteger resultCount = 0;
    __block NSInteger readyCount = 0;
    dispatch_async(dispatch_get_main_queue(), ^{
        UIViewController *parent = [[UIApplication.sharedApplication.delegate window] rootViewController];
        NSString *backLabel = rtl ? @"رجوع" : @"Retour";
        __block NiTokenizationCard *card;
        card = [[NiTokenizationCard alloc] initWithConfig:@{
            @"requestId": @"native-back-fixture", @"rtl": @(rtl),
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
            XCTAssertTrue([(UIView *)[card valueForKey:@"processingView"] isHidden]);
            XCTAssertNil(parent.presentedViewController);
            card = nil;
            [done fulfill];
        }];
        NSURLSessionConfiguration *transport = NSURLSessionConfiguration.ephemeralSessionConfiguration;
        transport.protocolClasses = @[NativeCardStubProtocol.class];
        [card setValue:transport forKey:@"sessionConfiguration"];
        [card presentFrom:parent];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.6 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            UINavigationController *navigation = (UINavigationController *)parent.presentedViewController;
            XCTAssertTrue([navigation isKindOfClass:UINavigationController.class]);
            UISemanticContentAttribute expected = rtl ? UISemanticContentAttributeForceRightToLeft : UISemanticContentAttributeForceLeftToRight;
            XCTAssertEqual(navigation.view.semanticContentAttribute, expected);
            XCTAssertEqual(navigation.navigationBar.semanticContentAttribute, expected);
            __block UIButton *back = nil;
            [self findSubviewInView:navigation.view matching:^BOOL(UIView *view) {
                if ([view isKindOfClass:UIButton.class] && [view.accessibilityIdentifier isEqualToString:@"tokenization-card-back"]) {
                    back = (UIButton *)view;
                    return YES;
                }
                return NO;
            }];
            XCTAssertNotNil(back);
            XCTAssertEqualObjects(back.accessibilityLabel, backLabel);
            XCTAssertEqual(back.semanticContentAttribute, expected);
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
