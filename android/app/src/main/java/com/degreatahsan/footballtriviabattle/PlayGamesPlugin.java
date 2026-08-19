package com.degreatahsan.footballtriviabattle;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.PlayGamesSdk;

/**
 * Play Games Services v2 sign-in, exposed to the web layer.
 *
 * The point of this plugin is the auth code: {@code requestServerSideAccess}
 * returns a one-time code that only our backend can redeem (it needs the OAuth
 * client secret), which the pgs-signin Edge Function trades for a verified
 * Player ID and a Supabase session. Nothing here proves anything on its own —
 * the device is deliberately not trusted.
 *
 * Everything degrades to "unavailable" rather than throwing: no Play Services,
 * a player who declined Play Games, a child account, an unconfigured build.
 * The web layer treats all of those the same way — show the sign-in screen.
 */
@CapacitorPlugin(name = "PlayGames")
public class PlayGamesPlugin extends Plugin {

    /** Placeholder in res/values/play_games.xml before the PGS project exists. */
    private static final String UNSET = "UNSET";

    private boolean initialised = false;

    private String projectId() {
        return getContext().getString(R.string.game_services_project_id);
    }

    private String webClientId() {
        return getContext().getString(R.string.play_games_web_client_id);
    }

    @Override
    public void load() {
        // Initialising with a placeholder project id crashes the process, so an
        // unconfigured build simply never initialises. PGS v2 also starts its
        // automatic sign-in attempt here — by the time JS asks, the answer is
        // usually already known.
        if (!UNSET.equals(projectId()) && !UNSET.equals(webClientId())) {
            PlayGamesSdk.initialize(getContext());
            initialised = true;
        }
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", initialised);
        call.resolve(result);
    }

    /** Whether the automatic sign-in at startup actually signed this player in. */
    @PluginMethod
    public void isAuthenticated(PluginCall call) {
        if (!initialised) {
            resolveAuthenticated(call, false);
            return;
        }
        PlayGames
            .getGamesSignInClient(getActivity())
            .isAuthenticated()
            .addOnCompleteListener(task ->
                resolveAuthenticated(call, task.isSuccessful() && task.getResult().isAuthenticated())
            );
    }

    /**
     * Shows the Play Games sign-in prompt. Only for a player who dismissed the
     * automatic attempt — calling it unprompted is exactly the interruption
     * this whole feature exists to remove.
     */
    @PluginMethod
    public void signIn(PluginCall call) {
        if (!initialised) {
            resolveAuthenticated(call, false);
            return;
        }
        PlayGames
            .getGamesSignInClient(getActivity())
            .signIn()
            .addOnCompleteListener(task ->
                resolveAuthenticated(call, task.isSuccessful() && task.getResult().isAuthenticated())
            );
    }

    /**
     * One-time auth code for our backend to redeem. Resolves with a null
     * authCode rather than rejecting when Play Games can't produce one, so the
     * JS side has a single "no code, carry on" path.
     */
    @PluginMethod
    public void requestServerSideAccess(PluginCall call) {
        if (!initialised) {
            resolveAuthCode(call, null);
            return;
        }
        PlayGames
            .getGamesSignInClient(getActivity())
            // false: we want a plain auth code, not offline access with a
            // refresh token. The session Supabase mints is what persists.
            .requestServerSideAccess(webClientId(), false)
            .addOnCompleteListener(task -> resolveAuthCode(call, task.isSuccessful() ? task.getResult() : null));
    }

    private void resolveAuthenticated(PluginCall call, boolean authenticated) {
        JSObject result = new JSObject();
        result.put("authenticated", authenticated);
        call.resolve(result);
    }

    private void resolveAuthCode(PluginCall call, String authCode) {
        JSObject result = new JSObject();
        result.put("authCode", authCode);
        call.resolve(result);
    }
}
