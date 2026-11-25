package ae.network;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;

final class GooglePayConfiguration {
    private GooglePayConfiguration() { }

    static List<String> networks(List<?> configured) {
        if (configured == null) return Arrays.asList("VISA", "MASTERCARD");
        if (configured.isEmpty()) throw new IllegalArgumentException("Invalid wallet networks");
        List<String> supported = Arrays.asList("AMEX", "DISCOVER", "INTERAC", "JCB", "MASTERCARD", "VISA");
        LinkedHashSet<String> networks = new LinkedHashSet<>();
        for (Object value : configured) {
            if (!(value instanceof String)) throw new IllegalArgumentException("Invalid wallet networks");
            String network = ((String) value).trim().toUpperCase(Locale.ROOT);
            if (!supported.contains(network)) throw new IllegalArgumentException("Invalid wallet networks");
            networks.add(network);
        }
        return new ArrayList<>(networks);
    }

    static String country(String configured) {
        if (configured == null) throw new IllegalArgumentException("Invalid wallet country");
        String country = configured.trim().toUpperCase(Locale.ROOT);
        if (!Arrays.asList(Locale.getISOCountries()).contains(country)) {
            throw new IllegalArgumentException("Invalid wallet country");
        }
        return country;
    }
}
