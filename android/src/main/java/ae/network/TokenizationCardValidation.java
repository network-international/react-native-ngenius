package ae.network;

import java.net.URI;
import java.util.Calendar;
import java.util.Locale;

final class TokenizationCardValidation {
    private TokenizationCardValidation() { }
    static String digits(String value) { return value.replace(" ", "").replace("-", ""); }
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
