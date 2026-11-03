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
static NSInteger cardTestStatus;
@interface NativeCardStubProtocol : NSURLProtocol
@end
@implementation NativeCardStubProtocol
+ (BOOL)canInitWithRequest:(NSURLRequest *)request { return [request.URL.host isEqualToString:@"native-card.test"]; }
+ (NSURLRequest *)canonicalRequestForRequest:(NSURLRequest *)request { return request; }
- (void)startLoading {
    NSData *body = self.request.HTTPBody;
    if (!body && self.request.HTTPBodyStream) {
        NSInputStream *stream = self.request.HTTPBodyStream;
        [stream open]; NSMutableData *data = [NSMutableData new]; uint8_t bytes[4096]; NSInteger count;
        while ((count = [stream read:bytes maxLength:sizeof(bytes)]) > 0) [data appendBytes:bytes length:count];
        [stream close]; body = data;
    }
    cardTestBody = body ? [NSJSONSerialization JSONObjectWithData:body options:0 error:nil] : nil;
    NSDictionary *response = cardTestStatus == 200 ? @{ @"tokenRef": @"fixture-card", @"type": @"CARD", @"status": @"VERIFIED",
      @"cardDetails": @{ @"scheme": @"VISA", @"last4": @"1111", @"expiry": @"2099-12" }, @"card": cardTestBody[@"card"] ?: @{} } : @{ @"message": @"private fixture error", @"card": cardTestBody[@"card"] ?: @{} };
    NSData *data = [NSJSONSerialization dataWithJSONObject:response options:0 error:nil];
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


- (void)runNativeCardWithStatus:(NSInteger)status cancel:(BOOL)cancel {
    cardTestBody = nil; cardTestStatus = status;
    XCTestExpectation *done = [self expectationWithDescription:@"Native Card result"];
    dispatch_async(dispatch_get_main_queue(), ^{
        UIViewController *parent = [[UIApplication.sharedApplication.delegate window] rootViewController];
        __block NiTokenizationCard *card;
        NSDictionary *consent = @{ @"status": @"NOT_COLLECTED", @"merchantSelectedSkipConsent": @YES,
          @"clientTimestamp": @"2026-10-26T06:15:30.000Z", @"channel": @"REACT_NATIVE" };
        card = [[NiTokenizationCard alloc] initWithConfig:@{ @"requestId": @"native-fixture", @"labels": @{} }
          ready:^(NSString *requestId) {
            XCTAssertTrue([requestId isEqualToString:@"native-fixture"]);
            [card submit:@{ @"url": @"https://native-card.test/api/outlets/outlet/cards", @"accessToken": @"fixture-access", @"consentData": consent }];
          } result:^(NSString *result, NSDictionary *response) {
            if (cancel) {
                XCTAssertTrue([result isEqualToString:@"Aborted"]); XCTAssertNil(cardTestBody);
            } else {
                XCTAssertTrue([cardTestBody[@"consentData"] isEqual:consent]);
                XCTAssertTrue([cardTestBody[@"card"] isKindOfClass:NSDictionary.class]);
                XCTAssertTrue([cardTestBody[@"card"] count] == 4);
                if (status == 200) {
                    XCTAssertTrue([result isEqualToString:@"Response"]);
                    XCTAssertTrue([response[@"status"] isEqualToString:@"VERIFIED"]);
                    XCTAssertNil(response[@"card"]); XCTAssertNil(response[@"cardDetails"][@"pan"]);
                } else { XCTAssertTrue([result isEqualToString:@"Failed"]); XCTAssertTrue(response.count == 0); }
            }
            XCTAssertTrue([[(UITextField *)[card valueForKey:@"pan"] text] length] == 0);
            XCTAssertTrue([[(UITextField *)[card valueForKey:@"cvv"] text] length] == 0);
            cardTestBody = nil; card = nil; [done fulfill];
          }];
        NSURLSessionConfiguration *transport = NSURLSessionConfiguration.ephemeralSessionConfiguration;
        transport.protocolClasses = @[NativeCardStubProtocol.class];
        [card setValue:transport forKey:@"sessionConfiguration"];
        [card presentFrom:parent];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.6 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            UITextField *pan = [card valueForKey:@"pan"]; UITextField *cvv = [card valueForKey:@"cvv"];
            XCTAssertTrue(pan.secureTextEntry); XCTAssertTrue(cvv.secureTextEntry);
            if (cancel) { [card cancel]; return; }
            pan.text = [@"4" stringByPaddingToLength:16 withString:@"1" startingAtIndex:0];
            cvv.text = [NSString stringWithFormat:@"%d", 100 + 20 + 3];
            [(UITextField *)[card valueForKey:@"expiry"] setText:@"12/99"];
            [(UITextField *)[card valueForKey:@"holder"] setText:@"QA Test"];
            [card prepare];
        });
    });
    [self waitForExpectations:@[done] timeout:20];
}
- (void)testNativeCardVerifiedRequestAndSafeBridgeResponse { [self runNativeCardWithStatus:200 cancel:NO]; }
- (void)testNativeCardErrorDoesNotExposeResponseBody { [self runNativeCardWithStatus:401 cancel:NO]; }
- (void)testNativeCardCancelClearsFieldsWithoutSubmitting { [self runNativeCardWithStatus:200 cancel:YES]; }

@end
