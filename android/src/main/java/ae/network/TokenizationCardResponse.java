package ae.network;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import com.google.gson.JsonParser;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

final class TokenizationCardResponse {
    private TokenizationCardResponse() {}

    // Add Card returns the updated session list. Parse directly from the response
    // stream and only pass allowlisted values to the React Native bridge.
    static Map<String, Object> read(InputStream input) {
        JsonObject source = JsonParser.parseReader(new InputStreamReader(input, StandardCharsets.UTF_8))
            .getAsJsonObject();
        JsonElement tokens = source.get("tokens");
        if (tokens == null || !tokens.isJsonArray()) {
            throw new JsonParseException("Add Card response requires a token list");
        }
        JsonArray sourceTokens = tokens.getAsJsonArray();
        List<Map<String, Object>> safeTokens = new ArrayList<>(sourceTokens.size());
        for (JsonElement token : sourceTokens) {
            safeTokens.add(safeToken(token.getAsJsonObject()));
        }

        Map<String, Object> safe = new HashMap<>();
        safe.put("tokens", safeTokens);
        copyString(source, safe, "tncUrl");
        JsonElement page = source.get("page");
        if (page != null && page.isJsonObject()) {
            Map<String, Object> safePage = new HashMap<>();
            for (String field : new String[]{"number", "size", "totalElements", "totalPages"}) {
                JsonElement value = page.getAsJsonObject().get(field);
                if (value != null && value.isJsonPrimitive() && value.getAsJsonPrimitive().isNumber()) {
                    safePage.put(field, value.getAsDouble());
                }
            }
            safe.put("page", safePage);
        }
        return safe;
    }

    private static Map<String, Object> safeToken(JsonObject source) {
        Map<String, Object> safe = new HashMap<>();
        for (String field : new String[]{"tokenRef", "type", "status", "walletType"}) {
            copyString(source, safe, field);
        }
        JsonElement details = source.get("cardDetails");
        if (details != null && details.isJsonObject()) {
            JsonObject cardDetails = details.getAsJsonObject();
            Map<String, Object> masked = new HashMap<>();
            copyString(cardDetails, masked, "scheme");
            String last4 = stringField(cardDetails, "last4");
            String expiry = stringField(cardDetails, "expiry");
            if (last4 != null && last4.matches("[0-9]{4}")) masked.put("last4", last4);
            if (expiry != null && expiry.matches("[0-9]{4}-(0[1-9]|1[0-2])")) masked.put("expiry", expiry);
            safe.put("cardDetails", masked);
        }
        return safe;
    }

    private static void copyString(JsonObject source, Map<String, Object> target, String field) {
        String value = stringField(source, field);
        if (value != null) target.put(field, value);
    }

    private static String stringField(JsonObject source, String field) {
        JsonElement value = source.get(field);
        return value != null && value.isJsonPrimitive() && value.getAsJsonPrimitive().isString()
            ? value.getAsString()
            : null;
    }
}
