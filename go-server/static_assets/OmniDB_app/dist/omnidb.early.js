(function() {
  "use strict";
  function exposeGlobals(...namespaces) {
    for (const ns of namespaces) {
      Object.assign(window, ns);
    }
  }
  var v_calls_count = 0;
  var v_is_loading = false;
  function startLoading() {
    v_calls_count++;
    if (!v_is_loading) {
      $("#div_loading").fadeIn(100);
      v_is_loading = true;
    }
  }
  function endLoading() {
    if (v_calls_count > 0) {
      v_calls_count--;
    }
    if (v_calls_count == 0) {
      $("#div_loading").fadeOut(100);
      v_is_loading = false;
    }
  }
  function getCookie(name) {
    var cookieValue = null;
    if (document.cookie && document.cookie !== "") {
      var cookies = document.cookie.split(";");
      for (var i = 0; i < cookies.length; i++) {
        var cookie = jQuery.trim(cookies[i]);
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
    var csrftoken = getCookie(v_csrf_cookie_name);
    v_ajax_call = $.ajax({
      url: v_url_folder + p_url,
      data: {
        data: p_data,
        tab_token: ""
      },
      type: "post",
      dataType: "json",
      beforeSend: function(xhr, settings) {
        if (!csrfSafeMethod(settings.type) && !this.crossDomain) {
          xhr.setRequestHeader("X-CSRFToken", csrftoken);
        }
      },
      success: function(p_return) {
        if (p_loading == null || p_loading == true) {
          endLoading();
        }
        if (p_return.v_error) {
          if (p_return.v_error_id == 1) {
            showAlert("User not authenticated, please reload the page.");
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
      },
      error: function(msg) {
        if (p_loading == null || p_loading == true) {
          endLoading();
        }
        if (p_onAjaxErrorCallBack) {
          p_onAjaxErrorCallBack(msg);
        } else {
          if (msg.readyState != 0) {
            showAlert("Request error.");
          } else {
            if (msg.statusText != "abort") {
              reportOffline();
            }
          }
        }
      }
    });
    return v_ajax_call;
  }
  function reportOffline() {
    showAlert("Webserver was shutdown, please restart it and reload the application.");
    document.getElementById("ajax_status");
  }
  const ajaxControl = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    cancelAjax,
    csrfSafeMethod,
    endLoading,
    execAjax,
    getCookie,
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
