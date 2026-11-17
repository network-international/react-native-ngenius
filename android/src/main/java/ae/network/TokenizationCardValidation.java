package ae.network;

import java.net.URI;
import java.util.Calendar;
import java.util.Locale;
import java.util.regex.Pattern;

final class TokenizationCardValidation {
    private static final Pattern MADA_PREFIX = Pattern.compile(
        "(4(0(0861|1757|3024|6136|6996|7(197|395)|9201)|1(2565|0621|0685|7633|9593)|2(0132|1141|281([789])|689700|8(331|67([123])))|3(1361|2328|4107|9954)|4(0(533|647|795)|5564|6(393|404|672))"
        + "|5(5(036|708)|7865|7997|8456)|6(2220|854([0123]))|7(4491)|8(301([012])|4783|609([456])|931([789]))"
        + "|93428)"
        + "|5(0(4300|6968|8160)|13213|2(0058|1076|4(130|514)|9(415|741))|3(0(060|906)|1(095|196)|2013|5(825|989)|6023|7767|9931)|4(3(085|357)|9760)|5(4180|7606|8563|8848)|8(5265|8(8(4([56789])|5([01]))|98([23]))|9(005|206)))"
        + "|6(0(4906|5141)|36120)"
        + "|682(242030|420132|530060|682003)|9682(0([123456789])|1([01])))");

    private TokenizationCardValidation() { }
    static String digits(String value) { return value.replace(" ", "").replace("-", ""); }
    static String scheme(String pan) {
        // Local scheme prefixes take precedence over co-badged international schemes.
        if (pan.matches("(669009[0-9]{2}|669010[0-9]{2}|9784500[0-9])[0-9]*")) return "Jaywan";
        if (MADA_PREFIX.matcher(pan).lookingAt()) return "mada";
        if (pan.startsWith("4")) return "Visa";
        if (pan.matches("(5[1-5]|2(22[1-9]|2[3-9][0-9]|[3-6][0-9]{2}|7[01][0-9]|720))[0-9]*")) return "Mastercard";
        if (pan.startsWith("34") || pan.startsWith("37")) return "American Express";
        if (pan.matches("(6011|65|64[4-9]|6221[2-9]|622[3-9])[0-9]*")) return "Discover";
        if (pan.matches("35(2[89]|[3-8][0-9])[0-9]*")) return "JCB";
        if (pan.matches("(30[0-5]|3[689])[0-9]*")) return "Diners Club";
        if (pan.length() >= 6 && pan.startsWith("62")) return "UnionPay";
        return null;
    }
    static int cvvLength(String pan) {
        return pan.startsWith("34") || pan.startsWith("37") ? 4 : 3;
    }
    static boolean validCvv(String pan, String cvv) {
        return cvv.length() == cvvLength(pan) && cvv.matches("[0-9]+");
    }
    static boolean validPan(String value) {
        String pan = digits(value);
        if (!pan.matches("[0-9]{13,19}")) return false;
        int sum = 0;
        boolean doubleDigit = false;
        for (int i = pan.length() - 1; i >= 0; i--) {
            int digit = pan.charAt(i) - '0';
            if (doubleDigit) { digit *= 2; if (digit > 9) digit -= 9; }
            sum += digit;
            doubleDigit = !doubleDigit;
        }
        return sum > 0 && sum % 10 == 0;
    }
    static String expiry(String value) {
        int month, year;
        try {
            if (value.matches("[0-9]{2}/[0-9]{2}")) {
                month = Integer.parseInt(value.substring(0, 2));
                year = 2000 + Integer.parseInt(value.substring(3));
            } else if (value.matches("[0-9]{4}-[0-9]{2}")) {
                year = Integer.parseInt(value.substring(0, 4));
                month = Integer.parseInt(value.substring(5));
            } else return null;
        } catch (NumberFormatException ignored) { return null; }
        Calendar now = new java.util.GregorianCalendar();
        if (month < 1 || month > 12 || year < now.get(Calendar.YEAR) ||
            (year == now.get(Calendar.YEAR) && month < now.get(Calendar.MONTH) + 1)) return null;
        return String.format(Locale.ROOT, "%04d-%02d", year, month);
    }
    static boolean validUsageType(String value) {
        return "ONCE_OFF".equals(value) || "PERMANENT".equals(value);
    }
    static boolean validEndpoint(String value, String sessionRef) {
        if (sessionRef == null || !sessionRef.matches("[A-Za-z0-9:_-]{1,100}")) return false;
        try {
            URI uri = new URI(value);
            return "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null &&
                uri.getUserInfo() == null && uri.getQuery() == null && uri.getFragment() == null &&
                uri.getRawPath().matches(".*/api/outlets/[^/]+/payment-tokenization-sessions/[^/]+/cards") &&
                uri.getPath().endsWith("/payment-tokenization-sessions/" + sessionRef + "/cards");
        } catch (Exception ignored) { return false; }
    }
}
