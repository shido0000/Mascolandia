package com.shido0000.mascolandia;

import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(name = "Ussd", permissions = {
    @Permission(strings = { android.Manifest.permission.CALL_PHONE }, alias = "call")
})
public class UssdPlugin extends Plugin {

    @PluginMethod
    public void send(PluginCall call) {
        String code = call.getString("code");
        if (code == null || code.isEmpty()) {
            call.reject("missing_code");
            return;
        }
        if (!hasPermission("call")) {
            saveCall(call);
            requestPermissionForAlias("call", call, "onPermissionResult");
            return;
        }
        dial(call, code);
    }

    @PermissionCallback
    public void onPermissionResult(PluginCall call) {
        if (hasPermission("call")) {
            dial(call, call.getString("code"));
        } else {
            call.reject("permission_denied");
        }
    }

    private void dial(PluginCall call, String code) {
        try {
            String encoded = code.replace("#", "%23").replace("+", "%2B");
            Intent intent = new Intent(Intent.ACTION_CALL, Uri.parse("tel:" + encoded));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("dialed", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("dial_failed");
        }
    }
}
