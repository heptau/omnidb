(function() {
  "use strict";
  function exposeGlobals(...namespaces) {
    for (const ns of namespaces) {
      Object.assign(window, ns);
    }
  }
  function interpolate(s, vars) {
    return s;
  }
  function t(key, vars) {
    var dict = typeof v_i18n !== "undefined" ? v_i18n : null;
    var template = dict && Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : void 0;
    if (template === void 0) {
      console.warn('i18n: missing translation key "' + key + '"');
      template = key;
    }
    return interpolate(template);
  }
  var v_calls_count = 0;
  var v_is_loading = false;
  function startLoading() {
    v_calls_count++;
    if (!v_is_loading) {
      document.getElementById("div_loading").style.display = "block";
      v_is_loading = true;
    }
  }
  function endLoading() {
    if (v_calls_count > 0) {
      v_calls_count--;
    }
    if (v_calls_count == 0) {
      document.getElementById("div_loading").style.display = "none";
      v_is_loading = false;
    }
  }
  function jsonPostHeaders() {
    return {
      "Content-Type": "application/json",
      "X-CSRFToken": getCookie(v_csrf_cookie_name) || ""
    };
  }
  function getCookie(name) {
    var cookieValue = null;
    if (document.cookie && document.cookie !== "") {
      var cookies = document.cookie.split(";");
      for (var i = 0; i < cookies.length; i++) {
        var cookie = cookies[i].trim();
        if (cookie.substring(0, name.length + 1) === name + "=") {
          cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
          break;
        }
      }
    }
    return cookieValue;
  }
  function csrfSafeMethod(method) {
    return /^(GET|HEAD|OPTIONS|TRACE)$/.test(method);
  }
  var v_ajax_call = null;
  var v_cancel_button = document.getElementById("bt_cancel_ajax");
  function cancelAjax() {
    if (v_ajax_call != null) {
      v_ajax_call.abort();
    }
  }
  function execAjax(p_url, p_data, p_successFunc, p_errorFunc, p_notifMode, p_loading, p_cancel_button, p_onAjaxErrorCallBack = false) {
    if (p_loading == null || p_loading == true) {
      startLoading();
    }
    if (v_cancel_button != null) {
      v_cancel_button.style.display = "none";
      if (p_cancel_button != null && p_cancel_button == true) {
        v_cancel_button.style.display = "block";
      }
    }
    var v_controller = new AbortController();
    var v_handle = {
      readyState: 1,
      abort: function() {
        v_handle.readyState = 0;
        v_controller.abort();
      }
    };
    v_ajax_call = v_handle;
    var v_finishLoading = function() {
      if (p_loading == null || p_loading == true) {
        endLoading();
      }
    };
    var v_fail = function(msg) {
      v_finishLoading();
      if (p_onAjaxErrorCallBack) {
        p_onAjaxErrorCallBack(msg);
      } else {
        if (msg.readyState != 0) {
          showAlert(t("errors.request_error"));
        } else {
          if (msg.statusText != "abort") {
            reportOffline();
          }
        }
      }
    };
    (async function() {
      var p_return;
      try {
        var v_response = await fetch(v_url_folder + p_url, {
          method: "POST",
          // URLSearchParams sets the form-urlencoded Content-Type itself.
          body: new URLSearchParams({
            data: typeof p_data === "string" ? p_data : JSON.stringify(p_data),
            tab_token: ""
          }),
          headers: { "X-CSRFToken": getCookie(v_csrf_cookie_name) || "" },
          signal: v_controller.signal
        });
        if (!v_response.ok) {
          v_handle.readyState = 4;
          v_fail({ readyState: 4, status: v_response.status, statusText: v_response.statusText });
          return;
        }
        p_return = await v_response.json();
      } catch (e) {
        var err = (
          /** @type {any} */
          e
        );
        if (err && err.name === "AbortError") {
          v_handle.readyState = 0;
          v_fail({ readyState: 0, status: 0, statusText: "abort" });
        } else if (err instanceof SyntaxError) {
          v_handle.readyState = 4;
          v_fail({ readyState: 4, status: 200, statusText: "parsererror" });
        } else {
          v_handle.readyState = 0;
          v_fail({ readyState: 0, status: 0, statusText: "error" });
        }
        return;
      }
      v_handle.readyState = 4;
      v_finishLoading();
      if (p_return.v_error) {
        if (p_return.v_error_id == 1) {
          showAlert(t("errors.not_authenticated"));
        } else if (p_errorFunc) {
          p_errorFunc(p_return);
        } else {
          showAlert(p_return.v_data);
        }
      } else {
        if (p_successFunc != null) {
          p_successFunc(p_return);
        }
      }
    })();
    return v_ajax_call;
  }
  function reportOffline() {
    showAlert(t("errors.webserver_shutdown"));
    document.getElementById("ajax_status");
  }
  const ajaxControl = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    cancelAjax,
    csrfSafeMethod,
    endLoading,
    execAjax,
    getCookie,
    jsonPostHeaders,
    reportOffline,
    startLoading,
    get v_ajax_call() {
      return v_ajax_call;
    },
    get v_calls_count() {
      return v_calls_count;
    },
    v_cancel_button,
    get v_is_loading() {
      return v_is_loading;
    }
  }, Symbol.toStringTag, { value: "Module" }));
  document.addEventListener("contextmenu", function(event) {
    var v_target = event.target;
    var v_editable = v_target instanceof Element && v_target.closest('input, textarea, [contenteditable="true"], [contenteditable=""]');
    if (!v_editable) {
      event.preventDefault();
    }
  });
  exposeGlobals(
    ajaxControl
  );
  if (v_cancel_button) {
    v_cancel_button.addEventListener("click", cancelAjax);
  }
})();
//# sourceMappingURL=omnidb.early.js.map
