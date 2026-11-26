#import "NiTokenizationCard.h"
#import <SafariServices/SafariServices.h>

@interface NICardNumberField : UITextField <UITextPasteDelegate>
@end

@implementation NICardNumberField
- (BOOL)canPerformAction:(SEL)action withSender:(id)sender {
    if (action == @selector(copy:) || action == @selector(cut:) || action == @selector(delete:)) return NO;
    return [super canPerformAction:action withSender:sender];
}
- (NSUndoManager *)undoManager { return nil; }
- (UITextRange *)textPasteConfigurationSupporting:(id<UITextPasteConfigurationSupporting>)field
                    performPasteOfAttributedString:(NSAttributedString *)text toRange:(UITextRange *)range {
    NSInteger start = [self offsetFromPosition:self.beginningOfDocument toPosition:range.start];
    NSInteger length = [self offsetFromPosition:range.start toPosition:range.end];
    if (start < 0 || length < 0) return nil;
    // The same native edit path handles typing, paste, and backspace.
    [self.delegate textField:self shouldChangeCharactersInRange:NSMakeRange(start, length) replacementString:text.string];
    return self.selectedTextRange;
}
@end

@interface NiTokenizationCard () <NSURLSessionTaskDelegate, UITextViewDelegate, UITextFieldDelegate>
@property (nonatomic, copy) NSString *requestId;
@property (nonatomic, copy) void (^ready)(NSString *);
@property (nonatomic, copy) void (^result)(NSString *, NSDictionary *);
@property (nonatomic, strong) NSDictionary *config;
@property (nonatomic, strong) UIViewController *presentationController;
@property (nonatomic, weak) UIView *panel;
@property (nonatomic, weak) UIScrollView *scroll;
@property (nonatomic, strong) UITextField *pan;
@property (nonatomic, copy) NSString *panDigits;
@property (nonatomic, strong) UITextField *expiry;
@property (nonatomic, strong) UITextField *cvv;
@property (nonatomic, strong) UITextField *holder;
@property (nonatomic, weak) UIView *cardDetails;
@property (nonatomic, strong) UIImageView *schemeIcon;
@property (nonatomic, copy) NSString *cvvPlaceholder;
@property (nonatomic, strong) UILabel *error;
@property (nonatomic, strong) UIButton *submitButton;
@property (nonatomic, strong) UIButton *backButton;
@property (nonatomic, strong) UIActivityIndicatorView *activityIndicator;
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
static BOOL NICardMatch(NSString *value, NSString *pattern) {
    return [[NSPredicate predicateWithFormat:@"SELF MATCHES %@", pattern] evaluateWithObject:value ?: @""];
}
static NSString *NICardNumber(NSString *text) {
    return [[text stringByReplacingOccurrencesOfString:@" " withString:@""] stringByReplacingOccurrencesOfString:@"-" withString:@""];
}
static NSString *NIFormattedPAN(NSString *digits, BOOL masked) {
    NSMutableString *text = [NSMutableString string];
    for (NSUInteger index = 0; index < digits.length; index++) {
        if (index > 0 && index % 4 == 0) [text appendString:@" "];
        [text appendFormat:@"%C", (unichar)(masked ? 0x2022 : [digits characterAtIndex:index])];
    }
    return text;
}
static NSUInteger NIPANDigitIndex(NSString *display, NSUInteger offset) {
    return [NICardNumber([display substringToIndex:offset]) length];
}
static NSUInteger NIPANCaretOffset(NSUInteger digitIndex, NSUInteger length) {
    if (digitIndex == 0) return 0;
    NSUInteger groups = (digitIndex - 1) / 4;
    if (digitIndex < length && digitIndex % 4 == 0) groups += 1;
    return digitIndex + groups;
}
static NSString *NICardScheme(NSString *pan) {
    if (pan.length < 2) return nil;
    // Keep the PayPage domestic BIN matches ahead of the international schemes.
    if (NICardMatch(pan, @"(669009[0-9]{2}|669010[0-9]{2}|9784500[0-9])[0-9]*")) return @"Jaywan";
    if (NICardMatch(pan, @"(4(0(0861|1757|3024|6136|6996|7(197|395)|9201)|1(2565|0621|0685|7633|9593)|2(0132|1141|281([789])|689700|8(331|67([123])))|3(1361|2328|4107|9954)|4(0(533|647|795)|5564|6(393|404|672))|5(5(036|708)|7865|7997|8456)|6(2220|854([0123]))|7(4491)|8(301([012])|4783|609([456])|931([789]))|93428)|5(0(4300|6968|8160)|13213|2(0058|1076|4(130|514)|9(415|741))|3(0(060|906)|1(095|196)|2013|5(825|989)|6023|7767|9931)|4(3(085|357)|9760)|5(4180|7606|8563|8848)|8(5265|8(8(4([56789])|5([01]))|98([23]))|9(005|206)))|6(0(4906|5141)|36120)|682(242030|420132|530060|682003)|9682(0([123456789])|1([01])))[0-9]*")) return @"mada";
    if ([pan hasPrefix:@"4"]) return @"Visa";
    if (NICardMatch(pan, @"(5[1-5]|2(22[1-9]|2[3-9][0-9]|[3-6][0-9]{2}|7[01][0-9]|720))[0-9]*")) return @"Mastercard";
    if ([pan hasPrefix:@"34"] || [pan hasPrefix:@"37"]) return @"American Express";
    if (NICardMatch(pan, @"(6011|6221[2-9]|622[3-9]|65|64[4-9])[0-9]*")) return @"Discover";
    if (NICardMatch(pan, @"35(2[89]|[3-8][0-9])[0-9]*")) return @"JCB";
    if (NICardMatch(pan, @"(30[0-5]|3[689])[0-9]*")) return @"Diners Club";
    if (pan.length >= 6 && [pan hasPrefix:@"62"]) return @"UnionPay";
    return nil;
}
static NSUInteger NICardCVVLength(NSString *pan) {
    return [pan hasPrefix:@"34"] || [pan hasPrefix:@"37"] ? 4 : 3;
}
- (UILabel *)footnote:(NSString *)text {
    UILabel *label = [UILabel new];
    label.text = text;
    label.textColor = NICardColor(self.config[@"colors"][@"payPageLabelColor"], UIColor.secondaryLabelColor);
    label.font = [UIFont preferredFontForTextStyle:UIFontTextStyleFootnote];
    label.adjustsFontForContentSizeCategory = YES;
    label.numberOfLines = 0;
    return label;
}
- (UIImage *)schemeImage:(NSString *)scheme {
    NSString *key = [scheme.lowercaseString stringByReplacingOccurrencesOfString:@" " withString:@""];
    if (!NICardMatch(key, @"[a-z]+")) return nil;
    NSURL *url = [[NSBundle bundleForClass:self.class] URLForResource:@"NITokenizationCardSchemes" withExtension:@"bundle"];
    if (!url) url = [NSBundle.mainBundle URLForResource:@"NITokenizationCardSchemes" withExtension:@"bundle"];
    NSBundle *artwork = url ? [NSBundle bundleWithURL:url] : nil;
    NSString *path = [artwork pathForResource:[@"ni_card_scheme_" stringByAppendingString:key] ofType:@"png"];
    return path ? [UIImage imageWithContentsOfFile:path] : nil;
}
- (void)addAcceptedSchemesToStack:(UIStackView *)stack title:(NSString *)title {
    NSMutableArray<NSString *> *schemes = [NSMutableArray array];
    id configuredSchemes = self.config[@"acceptedSchemes"];
    if (![configuredSchemes isKindOfClass:NSArray.class]) return;
    for (id scheme in configuredSchemes) {
        if ([scheme isKindOfClass:NSString.class] && [scheme length] > 0) [schemes addObject:scheme];
    }
    if (schemes.count == 0) return;

    NSMutableArray<UIImage *> *logos = [NSMutableArray arrayWithCapacity:schemes.count];
    for (NSString *scheme in schemes) {
        UIImage *logo = [self schemeImage:scheme];
        if (!logo) break;
        [logos addObject:logo];
    }

    if (logos.count != schemes.count) {
        NSString *list = [schemes componentsJoinedByString:@" · "];
        UILabel *label = [self footnote:[NSString stringWithFormat:@"%@: %@", title, list]];
        label.accessibilityIdentifier = @"tokenization-card-accepted-schemes";
        [stack addArrangedSubview:label];
        return;
    }

    UIScrollView *strip = [UIScrollView new];
    strip.showsHorizontalScrollIndicator = NO;
    strip.accessibilityIdentifier = @"tokenization-card-accepted-schemes";
    [strip.heightAnchor constraintEqualToConstant:28].active = YES;
    UIStackView *row = [UIStackView new];
    row.spacing = 8;
    row.translatesAutoresizingMaskIntoConstraints = NO;
    [strip addSubview:row];
    [NSLayoutConstraint activateConstraints:@[
        [row.leadingAnchor constraintEqualToAnchor:strip.contentLayoutGuide.leadingAnchor],
        [row.trailingAnchor constraintEqualToAnchor:strip.contentLayoutGuide.trailingAnchor],
        [row.topAnchor constraintEqualToAnchor:strip.contentLayoutGuide.topAnchor],
        [row.bottomAnchor constraintEqualToAnchor:strip.contentLayoutGuide.bottomAnchor],
        [row.heightAnchor constraintEqualToAnchor:strip.frameLayoutGuide.heightAnchor]
    ]];
    for (NSUInteger i = 0; i < logos.count; i++) {
        UIImageView *logoView = [[UIImageView alloc] initWithImage:logos[i]];
        logoView.contentMode = UIViewContentModeScaleAspectFit;
        logoView.isAccessibilityElement = YES;
        logoView.accessibilityLabel = schemes[i];
        logoView.accessibilityTraits = UIAccessibilityTraitImage;
        [logoView.widthAnchor constraintEqualToConstant:38].active = YES;
        [row addArrangedSubview:logoView];
    }
    [stack addArrangedSubview:strip];
}
- (void)updateDetectedScheme {
    NSString *scheme = NICardScheme(self.panDigits);
    NSString *previousScheme = self.pan.accessibilityHint;
    if (!self.schemeIcon.image || (scheme != previousScheme && ![scheme isEqualToString:previousScheme])) {
        id acceptedSchemes = self.config[@"acceptedSchemes"];
        BOOL enabled = scheme != nil && [acceptedSchemes isKindOfClass:NSArray.class] && [acceptedSchemes containsObject:scheme];
        UIImage *logo = enabled ? [self schemeImage:scheme] : nil;
        self.schemeIcon.image = logo ?: [UIImage systemImageNamed:@"creditcard"];
    }
    self.pan.accessibilityHint = scheme;
    [self setCardPlaceholder:NICardCVVLength(self.panDigits) == 4 ? @"1234" : self.cvvPlaceholder
                    forField:self.cvv];
}
- (void)setCardPlaceholder:(NSString *)value forField:(UITextField *)field {
    field.attributedPlaceholder = [[NSAttributedString alloc] initWithString:value attributes:@{
        NSForegroundColorAttributeName: NICardColor(self.config[@"colors"][@"textFieldPlaceholderColor"], UIColor.secondaryLabelColor)
    }];
}
- (BOOL)textField:(UITextField *)field shouldChangeCharactersInRange:(NSRange)range replacementString:(NSString *)text {
    NSString *current = field.text ?: @"";
    if (NSMaxRange(range) > current.length) return NO;
    if (field == self.pan) {
        NSString *digits = self.panDigits ?: @"";
        BOOL masked = [self.config[@"maskPaymentInfo"] isEqual:@YES];
        NSString *replacement = NICardNumber(text);
        if (!NICardMatch(replacement, @"[0-9]*") || ![current isEqualToString:NIFormattedPAN(digits, masked)]) return NO;
        NSUInteger start = NIPANDigitIndex(current, range.location);
        NSUInteger end = NIPANDigitIndex(current, NSMaxRange(range));
        if (start == end && range.length > 0 && replacement.length == 0 && start > 0) start -= 1;
        if (digits.length - (end - start) + replacement.length > 19) return NO;
        self.panDigits = [digits stringByReplacingCharactersInRange:NSMakeRange(start, end - start) withString:replacement];
        field.text = NIFormattedPAN(self.panDigits, masked);
        NSUInteger offset = NIPANCaretOffset(start + replacement.length, self.panDigits.length);
        UITextPosition *caret = [field positionFromPosition:field.beginningOfDocument offset:offset];
        if (caret) field.selectedTextRange = [field textRangeFromPosition:caret toPosition:caret];
        [self updateDetectedScheme];
        return NO;
    }
    if (field == self.cvv) {
        NSUInteger maxLength = self.panDigits.length < 2 ? 4 : NICardCVVLength(self.panDigits);
        return NICardMatch(text, @"[0-9]*") && current.length - range.length + text.length <= maxLength;
    }
    if (field == self.expiry) {
        NSString *next = [current stringByReplacingCharactersInRange:range withString:text];
        if (NICardMatch(next, @"[0-9]{4}-[0-9]{2}")) {
            field.text = [NSString stringWithFormat:@"%@/%@", [next substringFromIndex:5], [next substringWithRange:NSMakeRange(2, 2)]];
            return NO;
        }
        NSString *digits = [next stringByReplacingOccurrencesOfString:@"/" withString:@""];
        if (!NICardMatch(digits, @"[0-9]{0,4}")) return NO;
        if (range.length == 1 && text.length == 0 && [current characterAtIndex:range.location] == '/' && range.location > 0) {
            digits = [digits stringByReplacingCharactersInRange:NSMakeRange(range.location - 1, 1) withString:@""];
        }
        NSString *formatted = digits.length > 2 ? [NSString stringWithFormat:@"%@/%@", [digits substringToIndex:2], [digits substringFromIndex:2]] : digits;
        if ([formatted isEqualToString:next]) return YES;
        NSUInteger offset = range.location + text.length;
        if (offset > 2 && [next rangeOfString:@"/"].location == NSNotFound && formatted.length > digits.length) offset += 1;
        field.text = formatted;
        UITextPosition *caret = [field positionFromPosition:field.beginningOfDocument offset:MIN(offset, formatted.length)];
        if (caret) field.selectedTextRange = [field textRangeFromPosition:caret toPosition:caret];
        return NO;
    }
    return YES;
}
- (void)textFieldDidBeginEditing:(UITextField *)field {
    UIView *border = field == self.holder ? field : self.cardDetails;
    border.layer.borderColor = NICardColor(self.config[@"colors"][@"textFieldFocusColor"], UIColor.systemBlueColor).CGColor;
    [self revealActiveField];
}
- (void)textFieldDidEndEditing:(UITextField *)field {
    UIView *border = field == self.holder ? field : self.cardDetails;
    border.layer.borderColor = NICardColor(self.config[@"colors"][@"textFieldBorderColor"], UIColor.separatorColor).CGColor;
}
- (void)revealActiveField {
    for (UITextField *field in @[self.pan, self.expiry, self.cvv, self.holder]) {
        if (!field.isFirstResponder) continue;
        UIScrollView *scroll = self.scroll;
        CGRect fieldFrame = [field convertRect:field.bounds toView:scroll];
        UIEdgeInsets insets = scroll.adjustedContentInset;
        CGFloat visibleHeight = scroll.bounds.size.height - insets.top - insets.bottom;
        if (visibleHeight <= 0) return;
        CGFloat offset = scroll.contentOffset.y;
        CGFloat fieldTop = CGRectGetMinY(fieldFrame) - 10;
        CGFloat fieldBottom = CGRectGetMaxY(fieldFrame) + 10;
        if (fieldBottom > offset + insets.top + visibleHeight) offset = fieldBottom - insets.top - visibleHeight;
        if (fieldTop < offset + insets.top) offset = fieldTop - insets.top;
        CGFloat maxOffset = MAX(-insets.top, scroll.contentSize.height - scroll.bounds.size.height + insets.bottom);
        offset = MIN(maxOffset, MAX(-insets.top, offset));
        [scroll setContentOffset:CGPointMake(scroll.contentOffset.x, offset) animated:!UIAccessibilityIsReduceMotionEnabled()];
        break;
    }
}
- (void)keyboardFrameChanged:(NSNotification *)notification {
    UIScrollView *scroll = self.scroll;
    UIWindow *window = scroll.window;
    if (!window) return;
    CGRect keyboardScreen = [notification.userInfo[UIKeyboardFrameEndUserInfoKey] CGRectValue];
    CGRect keyboard = [scroll convertRect:[window convertRect:keyboardScreen fromCoordinateSpace:window.screen.coordinateSpace]
                                  fromView:window];
    CGRect covered = CGRectIntersection(scroll.bounds, keyboard);
    CGFloat coveredHeight = CGRectIsNull(covered) ? 0 : covered.size.height;
    UIEdgeInsets insets = UIEdgeInsetsMake(0, 0, coveredHeight, 0);
    scroll.contentInset = insets;
    scroll.verticalScrollIndicatorInsets = insets;
    [self revealActiveField];
}
static NSURL *NICardTermsURL(id value) {
    if (![value isKindOfClass:NSString.class] || [value rangeOfString:@"\\"].location != NSNotFound ||
        [value rangeOfCharacterFromSet:NSCharacterSet.whitespaceAndNewlineCharacterSet].location != NSNotFound) return nil;
    NSURLComponents *parts = [NSURLComponents componentsWithString:value];
    NSString *scheme = parts.scheme.lowercaseString;
    return ([scheme isEqualToString:@"https"] || [scheme isEqualToString:@"http"]) &&
        parts.host.length > 0 && !parts.user && !parts.password ? parts.URL : nil;
}
- (void)addConsentToStack:(UIStackView *)stack {
    NSDictionary *consent = self.config[@"consent"];
    if (![consent isKindOfClass:NSDictionary.class]) return;
    NSString *text = consent[@"text"];
    if (![text isKindOfClass:NSString.class] || text.length == 0) return;

    NSMutableAttributedString *content = [[NSMutableAttributedString alloc] initWithString:text attributes:@{
        NSFontAttributeName: [UIFont preferredFontForTextStyle:UIFontTextStyleFootnote],
        NSForegroundColorAttributeName: NICardColor(self.config[@"colors"][@"payPageLabelColor"], UIColor.secondaryLabelColor)
    }];
    NSURL *url = NICardTermsURL(consent[@"url"]);
    NSString *linkLabel = consent[@"linkLabel"];
    if (url && [linkLabel isKindOfClass:NSString.class] && linkLabel.length > 0) {
        NSRange range = [text rangeOfString:linkLabel];
        if (range.location != NSNotFound) [content addAttribute:NSLinkAttributeName value:url range:range];
    }
    UITextView *notice = [UITextView new];
    notice.delegate = self;
    notice.editable = NO;
    notice.scrollEnabled = NO;
    notice.backgroundColor = UIColor.clearColor;
    notice.textContainerInset = UIEdgeInsetsMake(0, 0, 4, 0);
    notice.textContainer.lineFragmentPadding = 0;
    notice.linkTextAttributes = @{ NSForegroundColorAttributeName: UIColor.linkColor, NSUnderlineStyleAttributeName: @(NSUnderlineStyleSingle) };
    notice.adjustsFontForContentSizeCategory = YES;
    notice.accessibilityIdentifier = @"tokenization-card-consent";
    notice.attributedText = content;
    [stack addArrangedSubview:notice];
}
- (BOOL)textView:(UITextView *)textView shouldInteractWithURL:(NSURL *)URL inRange:(NSRange)range interaction:(UITextItemInteraction)interaction {
    NSURL *safeURL = NICardTermsURL(URL.absoluteString);
    if (safeURL && interaction == UITextItemInteractionInvokeDefaultAction && !self.finished && !self.presentationController.presentedViewController) {
        SFSafariViewController *browser = [[SFSafariViewController alloc] initWithURL:safeURL];
        [self.presentationController presentViewController:browser animated:YES completion:nil];
    }
    return NO;
}
- (UILabel *)formLabel:(NSString *)text grouped:(BOOL)grouped {
    UILabel *label = [UILabel new];
    label.text = text;
    UIFontTextStyle style = grouped ? UIFontTextStyleCaption1 : UIFontTextStyleSubheadline;
    UIFont *preferred = [UIFont preferredFontForTextStyle:style];
    label.font = [UIFont systemFontOfSize:preferred.pointSize weight:UIFontWeightSemibold];
    label.adjustsFontForContentSizeCategory = YES;
    label.numberOfLines = 0;
    label.textColor = NICardColor(self.config[@"colors"][@"payPageLabelColor"], UIColor.labelColor);
    return label;
}
- (UITextField *)addField:(UITextField *)field label:(NSString *)label placeholder:(NSString *)placeholder
                    secret:(BOOL)secret numeric:(BOOL)numeric grouped:(BOOL)grouped stack:(UIStackView *)stack {
    UILabel *title = [self formLabel:label grouped:grouped];
    title.isAccessibilityElement = NO;
    [stack addArrangedSubview:title];
    if (grouped) {
        stack.layoutMarginsRelativeArrangement = YES;
        stack.directionalLayoutMargins = NSDirectionalEdgeInsetsMake(7, 12, 5, 12);
        [stack setCustomSpacing:1 afterView:title];
    } else {
        [stack setCustomSpacing:6 afterView:title];
        field.layer.cornerRadius = 10;
        field.layer.borderWidth = 1;
        field.layer.borderColor = NICardColor(self.config[@"colors"][@"textFieldBorderColor"], UIColor.separatorColor).CGColor;
        field.leftView = [[UIView alloc] initWithFrame:CGRectMake(0, 0, 12, 1)];
        field.rightView = [[UIView alloc] initWithFrame:CGRectMake(0, 0, 12, 1)];
        field.leftViewMode = UITextFieldViewModeAlways;
        field.rightViewMode = UITextFieldViewModeAlways;
    }
    field.delegate = self;
    field.font = [UIFont preferredFontForTextStyle:UIFontTextStyleBody];
    field.adjustsFontForContentSizeCategory = YES;
    field.accessibilityLabel = label;
    [self setCardPlaceholder:placeholder forField:field];
    field.secureTextEntry = secret;
    field.autocorrectionType = UITextAutocorrectionTypeNo; field.spellCheckingType = UITextSpellCheckingTypeNo;
    field.keyboardType = numeric ? UIKeyboardTypeNumberPad : UIKeyboardTypeDefault;
    field.textContentType = @"";
    field.textColor = NICardColor(self.config[@"colors"][@"payPageLabelColor"], UIColor.labelColor);
    [field.heightAnchor constraintGreaterThanOrEqualToConstant:grouped ? 32 : 50].active = YES;
    UIToolbar *toolbar = [UIToolbar new]; [toolbar sizeToFit];
    toolbar.items = @[[[UIBarButtonItem alloc] initWithBarButtonSystemItem:UIBarButtonSystemItemFlexibleSpace target:nil action:nil],
                      [[UIBarButtonItem alloc] initWithBarButtonSystemItem:UIBarButtonSystemItemDone target:field action:@selector(resignFirstResponder)]];
    field.inputAccessoryView = toolbar;
    [stack addArrangedSubview:field]; return field;
}
- (UIView *)formDividerVertical:(BOOL)vertical {
    UIView *line = [UIView new];
    line.backgroundColor = NICardColor(self.config[@"colors"][@"textFieldBorderColor"], UIColor.separatorColor);
    NSLayoutDimension *thickness = vertical ? line.widthAnchor : line.heightAnchor;
    [thickness constraintEqualToConstant:1].active = YES;
    return line;
}
- (void)presentFrom:(UIViewController *)parent {
    if (!parent || !parent.view.window || parent.presentedViewController || self.requestId.length == 0) { [self fail]; return; }
    NSDictionary *labels = self.config[@"labels"] ?: @{};
    UIViewController *controller = [UIViewController new];
    BOOL bottomSheet = [self.config[@"mode"] isEqual:@"bottomSheet"];
    UISemanticContentAttribute direction = [self.config[@"rtl"] boolValue]
        ? UISemanticContentAttributeForceRightToLeft : UISemanticContentAttributeForceLeftToRight;
    UIView *surface = controller.view;
    surface.backgroundColor = UIColor.clearColor;
    surface.semanticContentAttribute = direction;
    surface.accessibilityViewIsModal = YES;
    UIView *panel = [UIView new];
    self.panel = panel;
    panel.translatesAutoresizingMaskIntoConstraints = NO;
    panel.semanticContentAttribute = direction;
    panel.backgroundColor = NICardColor(self.config[@"colors"][@"payPageBackgroundColor"], UIColor.systemBackgroundColor);
    panel.accessibilityIdentifier = @"tokenization-native-card-panel";
    [surface addSubview:panel];
    [NSLayoutConstraint activateConstraints:@[
        [panel.centerXAnchor constraintEqualToAnchor:surface.centerXAnchor],
        [panel.bottomAnchor constraintEqualToAnchor:surface.bottomAnchor]
    ]];

    UIView *headerTop = panel;
    if (bottomSheet) {
        panel.layer.cornerRadius = 28;
        panel.layer.maskedCorners = kCALayerMinXMinYCorner | kCALayerMaxXMinYCorner;
        panel.clipsToBounds = YES;
        NSNumber *configuredFraction = self.config[@"sheetHeightFraction"];
        NSNumber *configuredHeight = self.config[@"sheetHeight"];
        CGFloat fraction = [configuredFraction isKindOfClass:NSNumber.class] ? configuredFraction.doubleValue : 0.64;
        CGFloat measuredHeight = [configuredHeight isKindOfClass:NSNumber.class] ? configuredHeight.doubleValue : 0;
        CGFloat presentingHeight = parent.view.bounds.size.height;
        if (presentingHeight > 0 && measuredHeight > 0 && measuredHeight <= presentingHeight) {
            fraction = measuredHeight / presentingHeight;
        }
        if (!(fraction > 0.25 && fraction <= 1)) fraction = 0.64;
        NSNumber *configuredWidth = self.config[@"sheetMaxWidth"];
        CGFloat maxWidth = [configuredWidth isKindOfClass:NSNumber.class] ? configuredWidth.doubleValue : 560;
        if (!(maxWidth > 0)) maxWidth = 560;
        NSLayoutConstraint *fullWidth = [panel.widthAnchor constraintEqualToAnchor:surface.widthAnchor];
        fullWidth.priority = UILayoutPriorityRequired - 1;
        [NSLayoutConstraint activateConstraints:@[
            fullWidth,
            [panel.widthAnchor constraintLessThanOrEqualToConstant:maxWidth],
            [panel.heightAnchor constraintEqualToAnchor:surface.heightAnchor multiplier:fraction]
        ]];
        UIControl *backdrop = [UIControl new];
        backdrop.translatesAutoresizingMaskIntoConstraints = NO;
        backdrop.isAccessibilityElement = NO;
        [backdrop addTarget:self action:@selector(dismissFromBackdrop) forControlEvents:UIControlEventTouchUpInside];
        [surface insertSubview:backdrop belowSubview:panel];
        [NSLayoutConstraint activateConstraints:@[
            [backdrop.leadingAnchor constraintEqualToAnchor:surface.leadingAnchor],
            [backdrop.trailingAnchor constraintEqualToAnchor:surface.trailingAnchor],
            [backdrop.topAnchor constraintEqualToAnchor:surface.topAnchor],
            [backdrop.bottomAnchor constraintEqualToAnchor:surface.bottomAnchor]
        ]];

        UIView *handleArea = [UIView new];
        handleArea.translatesAutoresizingMaskIntoConstraints = NO;
        [handleArea addGestureRecognizer:[[UIPanGestureRecognizer alloc] initWithTarget:self action:@selector(dismissFromSwipe:)]];
        [panel addSubview:handleArea];
        UIView *grabber = [UIView new];
        grabber.translatesAutoresizingMaskIntoConstraints = NO;
        grabber.backgroundColor = UIColor.tertiaryLabelColor;
        grabber.layer.cornerRadius = 2;
        grabber.userInteractionEnabled = NO;
        [handleArea addSubview:grabber];
        [NSLayoutConstraint activateConstraints:@[
            [handleArea.leadingAnchor constraintEqualToAnchor:panel.leadingAnchor],
            [handleArea.trailingAnchor constraintEqualToAnchor:panel.trailingAnchor],
            [handleArea.topAnchor constraintEqualToAnchor:panel.topAnchor],
            [handleArea.heightAnchor constraintEqualToConstant:18],
            [grabber.centerXAnchor constraintEqualToAnchor:handleArea.centerXAnchor],
            [grabber.centerYAnchor constraintEqualToAnchor:handleArea.centerYAnchor],
            [grabber.heightAnchor constraintEqualToConstant:4],
            [grabber.widthAnchor constraintEqualToConstant:36]
        ]];
        headerTop = handleArea;
    } else {
        [NSLayoutConstraint activateConstraints:@[
            [panel.leadingAnchor constraintEqualToAnchor:surface.leadingAnchor],
            [panel.trailingAnchor constraintEqualToAnchor:surface.trailingAnchor],
            [panel.topAnchor constraintEqualToAnchor:surface.topAnchor]
        ]];
    }

    UIButton *back = [UIButton buttonWithType:UIButtonTypeSystem];
    NSString *backLabel = labels[@"back"] ?: @"Back";
    UIImageSymbolConfiguration *chevron = [UIImageSymbolConfiguration configurationWithPointSize:17 weight:UIImageSymbolWeightSemibold];
    [back setImage:[UIImage systemImageNamed:@"chevron.backward" withConfiguration:chevron] forState:UIControlStateNormal];
    back.tintColor = NICardColor(self.config[@"colors"][@"payPageTitleColor"], UIColor.labelColor);
    back.semanticContentAttribute = direction;
    back.accessibilityLabel = backLabel;
    back.accessibilityIdentifier = @"tokenization-card-back";
    [back.widthAnchor constraintEqualToConstant:44].active = YES;
    [back.heightAnchor constraintEqualToConstant:44].active = YES;
    [back addTarget:self action:@selector(cancel) forControlEvents:UIControlEventTouchUpInside];
    self.backButton = back;

    UILabel *heading = [UILabel new];
    heading.text = labels[@"title"] ?: @"Pay by card";
    UIFont *headingFont = [UIFont systemFontOfSize:22 weight:UIFontWeightSemibold];
    heading.font = [[UIFontMetrics metricsForTextStyle:UIFontTextStyleTitle2] scaledFontForFont:headingFont];
    heading.adjustsFontForContentSizeCategory = YES;
    heading.textColor = back.tintColor;
    heading.numberOfLines = 2;
    heading.accessibilityTraits = UIAccessibilityTraitHeader;
    UIStackView *header = [[UIStackView alloc] initWithArrangedSubviews:@[back, heading]];
    header.translatesAutoresizingMaskIntoConstraints = NO;
    header.semanticContentAttribute = direction;
    header.alignment = UIStackViewAlignmentCenter;
    header.spacing = 6;
    [panel addSubview:header];

    UIScrollView *scroll = [UIScrollView new]; scroll.translatesAutoresizingMaskIntoConstraints = NO;
    self.scroll = scroll;
    scroll.semanticContentAttribute = direction;
    scroll.keyboardDismissMode = UIScrollViewKeyboardDismissModeOnDrag;
    scroll.accessibilityIdentifier = @"tokenization-native-card-scroll";
    scroll.contentInsetAdjustmentBehavior = UIScrollViewContentInsetAdjustmentNever;
    [panel addSubview:scroll];
    UIStackView *stack = [UIStackView new]; stack.translatesAutoresizingMaskIntoConstraints = NO;
    stack.axis = UILayoutConstraintAxisVertical; stack.spacing = 16;
    stack.semanticContentAttribute = direction;
    [scroll addSubview:stack];
    [NSLayoutConstraint activateConstraints:@[
        [header.leadingAnchor constraintEqualToAnchor:panel.safeAreaLayoutGuide.leadingAnchor constant:12],
        [header.trailingAnchor constraintEqualToAnchor:panel.safeAreaLayoutGuide.trailingAnchor constant:-20],
        [header.topAnchor constraintEqualToAnchor:bottomSheet ? headerTop.bottomAnchor : panel.safeAreaLayoutGuide.topAnchor],
        [scroll.leadingAnchor constraintEqualToAnchor:panel.safeAreaLayoutGuide.leadingAnchor],
        [scroll.trailingAnchor constraintEqualToAnchor:panel.safeAreaLayoutGuide.trailingAnchor],
        [scroll.topAnchor constraintEqualToAnchor:header.bottomAnchor],
        [scroll.bottomAnchor constraintEqualToAnchor:panel.safeAreaLayoutGuide.bottomAnchor],
        [stack.leadingAnchor constraintEqualToAnchor:scroll.contentLayoutGuide.leadingAnchor constant:24],
        [stack.trailingAnchor constraintEqualToAnchor:scroll.contentLayoutGuide.trailingAnchor constant:-24],
        [stack.topAnchor constraintEqualToAnchor:scroll.contentLayoutGuide.topAnchor constant:10],
        [stack.bottomAnchor constraintEqualToAnchor:scroll.contentLayoutGuide.bottomAnchor constant:-24],
        [stack.widthAnchor constraintEqualToAnchor:scroll.frameLayoutGuide.widthAnchor constant:-48]
    ]];
    [self addAcceptedSchemesToStack:stack title:labels[@"acceptedSchemes"] ?: @"Accepted cards"];
    UILabel *cardInformation = [self formLabel:labels[@"cardInformation"] ?: @"Card information" grouped:NO];
    cardInformation.accessibilityTraits = UIAccessibilityTraitHeader;
    [stack addArrangedSubview:cardInformation];
    [stack setCustomSpacing:7 afterView:cardInformation];
    UIStackView *cardDetails = [UIStackView new];
    cardDetails.axis = UILayoutConstraintAxisVertical;
    cardDetails.semanticContentAttribute = direction;
    cardDetails.layer.cornerRadius = 10;
    cardDetails.layer.borderWidth = 1;
    cardDetails.layer.borderColor = NICardColor(self.config[@"colors"][@"textFieldBorderColor"], UIColor.separatorColor).CGColor;
    cardDetails.clipsToBounds = YES;
    cardDetails.accessibilityIdentifier = @"tokenization-card-information-fields";
    self.cardDetails = cardDetails;
    [stack addArrangedSubview:cardDetails];
    UIStackView *panGroup = [UIStackView new];
    panGroup.axis = UILayoutConstraintAxisVertical;
    [cardDetails addArrangedSubview:panGroup];
    self.pan = [self addField:[NICardNumberField new] label:labels[@"pan"] ?: @"Card number"
                  placeholder:labels[@"panPlaceholder"] ?: @"•••• •••• •••• 1234" secret:NO numeric:YES grouped:YES stack:panGroup];
    self.pan.semanticContentAttribute = UISemanticContentAttributeForceLeftToRight;
    self.pan.textAlignment = NSTextAlignmentLeft;
    self.pan.smartInsertDeleteType = UITextSmartInsertDeleteTypeNo;
    self.pan.textDragInteraction.enabled = NO;
    UIDropInteraction *cardNumberDrop = self.pan.textDropInteraction;
    if (cardNumberDrop) [self.pan removeInteraction:cardNumberDrop];
    self.pan.pasteDelegate = (NICardNumberField *)self.pan;
    UIView *schemeSlot = [[UIView alloc] initWithFrame:CGRectMake(0, 0, 44, 24)];
    self.schemeIcon = [[UIImageView alloc] initWithFrame:CGRectMake(8, 0, 36, 24)];
    self.schemeIcon.contentMode = UIViewContentModeScaleAspectFit;
    self.schemeIcon.tintColor = UIColor.secondaryLabelColor;
    self.schemeIcon.isAccessibilityElement = NO;
    self.schemeIcon.accessibilityIdentifier = @"tokenization-card-detected-scheme";
    [schemeSlot addSubview:self.schemeIcon];
    self.pan.rightView = schemeSlot;
    self.pan.rightViewMode = UITextFieldViewModeAlways;
    [cardDetails addArrangedSubview:[self formDividerVertical:NO]];
    UIStackView *expiryGroup = [UIStackView new];
    expiryGroup.axis = UILayoutConstraintAxisVertical;
    UIStackView *cvvGroup = [UIStackView new];
    cvvGroup.axis = UILayoutConstraintAxisVertical;
    BOOL largeText = UIContentSizeCategoryIsAccessibilityCategory(controller.traitCollection.preferredContentSizeCategory);
    UIView *fieldDivider = [self formDividerVertical:!largeText];
    UIStackView *details = [[UIStackView alloc] initWithArrangedSubviews:@[expiryGroup, fieldDivider, cvvGroup]];
    details.semanticContentAttribute = direction;
    details.axis = largeText ? UILayoutConstraintAxisVertical : UILayoutConstraintAxisHorizontal;
    [expiryGroup.widthAnchor constraintEqualToAnchor:cvvGroup.widthAnchor].active = !largeText;
    [cardDetails addArrangedSubview:details];
    self.expiry = [self addField:[UITextField new] label:labels[@"expiry"] ?: @"Expiration date"
                     placeholder:labels[@"expiryPlaceholder"] ?: @"MM/YY" secret:NO numeric:YES grouped:YES stack:expiryGroup];
    self.cvvPlaceholder = labels[@"cvvPlaceholder"] ?: @"123";
    self.cvv = [self addField:[UITextField new] label:labels[@"cvv"] ?: @"Security code"
                  placeholder:self.cvvPlaceholder secret:YES numeric:YES grouped:YES stack:cvvGroup];
    UIView *cvvSlot = [[UIView alloc] initWithFrame:CGRectMake(0, 0, 31, 18)];
    UILabel *cvvIcon = [[UILabel alloc] initWithFrame:CGRectMake(6, 2, 25, 14)];
    cvvIcon.layer.cornerRadius = 3;
    cvvIcon.layer.borderWidth = 1;
    cvvIcon.layer.borderColor = UIColor.tertiaryLabelColor.CGColor;
    cvvIcon.textColor = UIColor.secondaryLabelColor;
    cvvIcon.font = [UIFont systemFontOfSize:9 weight:UIFontWeightSemibold];
    cvvIcon.text = @"•••";
    cvvIcon.textAlignment = NSTextAlignmentCenter;
    cvvIcon.isAccessibilityElement = NO;
    [cvvSlot addSubview:cvvIcon];
    self.cvv.rightView = cvvSlot;
    self.cvv.rightViewMode = UITextFieldViewModeAlways;
    self.holder = [self addField:[UITextField new] label:labels[@"name"] ?: @"Name on card"
                     placeholder:labels[@"namePlaceholder"] ?: @"Enter name on card" secret:NO numeric:NO grouped:NO stack:stack];
    [self updateDetectedScheme];
    self.error = [UILabel new]; self.error.numberOfLines = 0; self.error.textColor = UIColor.systemRedColor;
    self.error.hidden = YES;
    [stack addArrangedSubview:self.error];
    self.submitButton = [UIButton buttonWithType:UIButtonTypeSystem];
    [self.submitButton setTitle:labels[@"submit"] ?: @"Pay" forState:UIControlStateNormal];
    self.submitButton.backgroundColor = NICardColor(self.config[@"colors"][@"payButtonBackgroundColor"], UIColor.systemYellowColor);
    [self.submitButton setTitleColor:NICardColor(self.config[@"colors"][@"payButtonTitleColor"], UIColor.blackColor) forState:UIControlStateNormal];
    self.submitButton.layer.cornerRadius = 25;
    self.submitButton.titleLabel.font = [UIFont preferredFontForTextStyle:UIFontTextStyleHeadline];
    [self.submitButton.heightAnchor constraintEqualToConstant:50].active = YES;
    [self.submitButton addTarget:self action:@selector(prepare) forControlEvents:UIControlEventTouchUpInside];
    [stack addArrangedSubview:self.submitButton];
    self.activityIndicator = [[UIActivityIndicatorView alloc] initWithActivityIndicatorStyle:UIActivityIndicatorViewStyleMedium];
    self.activityIndicator.color = [self.submitButton titleColorForState:UIControlStateNormal];
    self.activityIndicator.hidesWhenStopped = YES;
    self.activityIndicator.isAccessibilityElement = NO;
    self.activityIndicator.accessibilityIdentifier = @"tokenization-card-spinner";
    self.activityIndicator.translatesAutoresizingMaskIntoConstraints = NO;
    [self.submitButton addSubview:self.activityIndicator];
    [NSLayoutConstraint activateConstraints:@[
        [self.activityIndicator.centerXAnchor constraintEqualToAnchor:self.submitButton.centerXAnchor],
        [self.activityIndicator.centerYAnchor constraintEqualToAnchor:self.submitButton.centerYAnchor]
    ]];
    [self addConsentToStack:stack];
    NSString *securityNote = self.config[@"securityNote"];
    if ([securityNote isKindOfClass:NSString.class] && securityNote.length > 0) {
        UILabel *note = [self footnote:securityNote];
        UIImageView *lock = [[UIImageView alloc] initWithImage:[UIImage systemImageNamed:@"lock"]];
        lock.tintColor = note.textColor;
        lock.isAccessibilityElement = NO;
        [lock setContentHuggingPriority:UILayoutPriorityRequired forAxis:UILayoutConstraintAxisHorizontal];
        UIStackView *security = [[UIStackView alloc] initWithArrangedSubviews:@[lock, note]];
        security.alignment = UIStackViewAlignmentCenter;
        security.spacing = 8;
        [stack addArrangedSubview:security];
    }
    self.presentationController = controller;
    controller.modalPresentationStyle = bottomSheet ? UIModalPresentationOverFullScreen : UIModalPresentationFullScreen;
    if (bottomSheet) controller.modalTransitionStyle = UIModalTransitionStyleCrossDissolve;
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(keyboardFrameChanged:)
                                                 name:UIKeyboardDidChangeFrameNotification object:nil];
    [parent presentViewController:controller animated:!UIAccessibilityIsReduceMotionEnabled() completion:nil];
}
- (void)dismissFromBackdrop {
    if (!self.prepared) [self cancel];
}
- (void)dismissFromSwipe:(UIPanGestureRecognizer *)gesture {
    if (!self.prepared && gesture.state == UIGestureRecognizerStateEnded &&
        [gesture translationInView:self.panel].y > 36) [self cancel];
}
- (void)prepare {
    if (self.prepared || self.finished) return;
    NSString *pan = self.panDigits ?: @"";
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
    NSString *holder = [self.holder.text stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
    valid = valid && self.cvv.text.length == NICardCVVLength(pan) && NICardMatch(self.cvv.text, @"[0-9]+") &&
        holder.length > 0 && holder.length <= 100;
    if (!valid) {
        self.error.text = self.config[@"labels"][@"invalid"] ?: @"Check card details";
        self.error.hidden = NO;
        return;
    }
    self.card = @{ @"pan": pan, @"expiry": [NSString stringWithFormat:@"%04ld-%02ld", (long)year, (long)month], @"cvv": self.cvv.text, @"cardholderName": holder };
    self.prepared = YES;
    self.error.hidden = YES;
    for (UITextField *field in @[self.pan, self.expiry, self.cvv, self.holder]) field.enabled = NO;
    NSString *processing = self.config[@"labels"][@"processing"] ?: @"Verifying payment method…";
    self.backButton.enabled = NO;
    self.submitButton.enabled = NO;
    [self.submitButton setTitle:@"" forState:UIControlStateNormal];
    self.submitButton.accessibilityLabel = processing;
    [self.presentationController.view endEditing:YES];
    [self.activityIndicator startAnimating];
    UIAccessibilityPostNotification(UIAccessibilityAnnouncementNotification, processing);
    if (self.ready) self.ready(self.requestId);
    self.ready = nil;
}
- (void)submit:(NSDictionary *)options {
    if (self.finished || self.sent || !self.card) return;
    NSString *url = options[@"url"], *token = options[@"accessToken"];
    NSString *sessionRef = options[@"sessionRef"], *usageType = options[@"usageType"];
    NSURLComponents *components = [url isKindOfClass:NSString.class] ? [NSURLComponents componentsWithString:url] : nil;
    BOOL safeURL = [components.scheme.lowercaseString isEqualToString:@"https"] &&
        components.host.length > 0 && !components.user && !components.password && !components.query && !components.fragment &&
        NICardMatch(components.percentEncodedPath, @".*/api/outlets/[^/]+/payment-tokenization-sessions/[^/]+/cards") &&
        [sessionRef isKindOfClass:NSString.class] && NICardMatch(sessionRef, @"[A-Za-z0-9:_-]{1,100}") &&
        [components.path hasSuffix:[NSString stringWithFormat:@"/payment-tokenization-sessions/%@/cards", sessionRef]];
    BOOL validUsageType = [usageType isKindOfClass:NSString.class] &&
        ([usageType isEqualToString:@"ONCE_OFF"] || [usageType isEqualToString:@"PERMANENT"]);
    if (!safeURL || !validUsageType || ![token isKindOfClass:NSString.class] || token.length == 0 ||
        [token rangeOfCharacterFromSet:NSCharacterSet.newlineCharacterSet].location != NSNotFound ||
        ![options[@"consentData"] isKindOfClass:NSDictionary.class]) { [self fail]; return; }
    self.sent = YES;
    NSData *payload = [NSJSONSerialization dataWithJSONObject:@{
        @"card": self.card, @"usageType": usageType, @"consentData": options[@"consentData"]
    } options:0 error:nil];
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
        if (!error && status >= 200 && status < 300 && data.length > 0) {
            id body = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
            if ([body isKindOfClass:NSDictionary.class]) safe = [self safeResponse:body];
        }
        NSDictionary *failure = nil;
        BOOL timedOut = [error.domain isEqualToString:NSURLErrorDomain] && error.code == NSURLErrorTimedOut;
        if (status == 408 || status == 504) failure = @{ @"code": @"REQUEST_TIMEOUT", @"httpStatus": @(status) };
        else if (timedOut) failure = @{ @"code": @"REQUEST_TIMEOUT" };
        else if (status >= 400 && status <= 599) failure = @{ @"httpStatus": @(status) };
        else if (error && status == 0) failure = @{ @"code": @"NETWORK_ERROR" };
        dispatch_async(dispatch_get_main_queue(), ^{ [self finish:safe ? @"Response" : @"Failed" response:safe ?: failure]; });
    }];
    [self.task resume];
}
// Add Card returns advisedTokens; the bridge always receives allowlisted `tokens`.
// The earlier `tokens` field is read only when advisedTokens is absent.
- (NSDictionary *)safeResponse:(NSDictionary *)body {
    NSArray *tokens = body[@"advisedTokens"] ?: body[@"tokens"];
    if (![tokens isKindOfClass:NSArray.class]) return nil;
    NSMutableArray *safeTokens = [NSMutableArray arrayWithCapacity:tokens.count];
    for (id token in tokens) {
        if (![token isKindOfClass:NSDictionary.class]) return nil;
        [safeTokens addObject:[self safeToken:token]];
    }
    NSMutableDictionary *safe = [@{ @"tokens": safeTokens } mutableCopy];
    if ([body[@"tncUrl"] isKindOfClass:NSString.class]) safe[@"tncUrl"] = body[@"tncUrl"];
    NSDictionary *page = body[@"page"];
    if ([page isKindOfClass:NSDictionary.class]) {
        NSMutableDictionary *safePage = [NSMutableDictionary new];
        for (NSString *key in @[@"number", @"size", @"totalElements", @"totalPages"]) {
            if ([page[key] isKindOfClass:NSNumber.class]) safePage[key] = page[key];
        }
        safe[@"page"] = safePage;
    }
    return safe;
}
- (NSDictionary *)safeToken:(NSDictionary *)body {
    NSMutableDictionary *safe = [NSMutableDictionary new];
    for (NSString *key in @[@"tokenRef", @"type", @"status", @"walletType"]) if ([body[key] isKindOfClass:NSString.class]) safe[key] = body[key];
    NSDictionary *cardDetails = body[@"cardDetails"];
    if ([cardDetails isKindOfClass:NSDictionary.class]) {
        NSMutableDictionary *details = [NSMutableDictionary new];
        if ([cardDetails[@"scheme"] isKindOfClass:NSString.class]) details[@"scheme"] = cardDetails[@"scheme"];
        NSString *last4 = cardDetails[@"last4"], *expiry = cardDetails[@"expiry"];
        if ([last4 isKindOfClass:NSString.class] && NICardMatch(last4, @"[0-9]{4}")) details[@"last4"] = last4;
        if ([expiry isKindOfClass:NSString.class] && NICardMatch(expiry, @"[0-9]{4}-(0[1-9]|1[0-2])"))
            details[@"expiry"] = expiry;
        safe[@"cardDetails"] = details;
    }
    return safe;
}
- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task willPerformHTTPRedirection:(NSHTTPURLResponse *)response newRequest:(NSURLRequest *)request completionHandler:(void (^)(NSURLRequest *))completionHandler {
    completionHandler(nil);
}
- (void)clearFields {
    self.panDigits = nil;
    self.pan.text = nil;
    self.cvv.text = nil;
    self.expiry.text = nil;
    self.holder.text = nil;
}
- (void)cancel { [self finish:@"Aborted" response:nil]; }
- (void)fail { [self finish:@"Failed" response:nil]; }
- (void)finish:(NSString *)status response:(NSDictionary *)response {
    if (self.finished) return;
    self.finished = YES; self.ready = nil; self.card = nil; [self clearFields];
    [self.activityIndicator stopAnimating];
    [self.task cancel]; self.task = nil; [self.session invalidateAndCancel]; self.session = nil;
    void (^callback)(NSString *, NSDictionary *) = self.result; self.result = nil;
    UIViewController *parent = self.presentationController.presentingViewController;
    if (parent) [parent dismissViewControllerAnimated:!UIAccessibilityIsReduceMotionEnabled() completion:^{ if (callback) callback(status, response ?: @{}); }];
    else if (callback) callback(status, response ?: @{});
}
@end
