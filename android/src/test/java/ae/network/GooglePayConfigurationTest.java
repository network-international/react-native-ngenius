package ae.network;

import org.junit.Test;
import java.util.Arrays;
import java.util.Collections;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

public class GooglePayConfigurationTest {
    @Test public void omittedNetworksKeepExistingDefaults() {
        assertEquals(Arrays.asList("VISA", "MASTERCARD"), GooglePayConfiguration.networks(null));
    }

    @Test public void configuredNetworksAreUsedWithoutAddingDefaults() {
        assertEquals(Collections.singletonList("AMEX"), GooglePayConfiguration.networks(Arrays.asList("amex", "AMEX")));
    }

    @Test public void emptyExplicitNetworksAreRejected() {
        try { GooglePayConfiguration.networks(Collections.emptyList()); fail(); }
        catch (IllegalArgumentException expected) { }
    }

    @Test public void unknownOrNonStringNetworksAreRejected() {
        for (Object value : Arrays.asList("UNKNOWN", "", null, 3)) {
            try { GooglePayConfiguration.networks(Collections.singletonList(value)); fail(); }
            catch (IllegalArgumentException expected) { }
        }
    }

    @Test public void configuredCountryUsesItsIsoCode() {
        assertEquals("AE", GooglePayConfiguration.country("ae"));
        assertEquals("GB", GooglePayConfiguration.country(" GB "));
    }

    @Test public void invalidCountryIsRejectedWithoutGuessingOne() {
        for (String value : Arrays.asList(null, "", "ZZ", "UNITED KINGDOM")) {
            try { GooglePayConfiguration.country(value); fail(); }
            catch (IllegalArgumentException expected) { }
        }
    }
}
