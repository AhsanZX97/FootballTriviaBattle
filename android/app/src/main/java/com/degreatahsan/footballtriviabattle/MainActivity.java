package com.degreatahsan.footballtriviabattle;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local plugins aren't in capacitor.plugins.json (that file only
        // lists npm plugins `cap sync` found), so this registration is what
        // makes PlayGames reachable from JS. Must precede super.onCreate.
        registerPlugin(PlayGamesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
