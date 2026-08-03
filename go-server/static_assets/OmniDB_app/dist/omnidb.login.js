(function() {
  function exposeGlobals(...namespaces) {
    for (const ns of namespaces) {
      Object.assign(window, ns);
    }
  }
  var v_message_modal_animating, v_message_modal_queued, v_message_modal_queued_function, v_shown_callback;
  function checkSessionMessage() {
    execAjax(
      "/check_session_message/",
      JSON.stringify({}),
      function(p_return) {
        if (p_return.v_data != "") showAlert$1(p_return.v_data);
      },
      null,
      "box"
    );
  }
  $(function() {
    v_message_modal_animating = false;
    v_message_modal_queued = false;
    v_message_modal_queued_function = null;
    v_shown_callback = null;
    $("#modal_message").on("hide.bs.modal", function(e) {
      v_message_modal_animating = true;
    });
    $("#modal_message").on("show.bs.modal", function(e) {
      v_message_modal_animating = true;
    });
    $("#modal_message").on("hidden.bs.modal", function(e) {
      document.getElementById("modal_message_content").innerHTML = "";
      v_message_modal_animating = false;
      if (v_message_modal_queued == true) {
        if (v_message_modal_queued_function != null) v_message_modal_queued_function();
        $("#modal_message").modal("show");
      }
      v_message_modal_queued = false;
      v_message_modal_queued_function = null;
    });
    $("#modal_message").on("shown.bs.modal", function(e) {
      v_message_modal_animating = false;
      if (v_shown_callback) {
        v_shown_callback();
        v_shown_callback = null;
      }
    });
  });
  function showMessageModal(p_content_function, p_large) {
    var v_dialog = document.getElementById("modal_message_dialog");
    if (p_large == null || p_large == false) {
      v_dialog.classList.remove("modal-xl");
    } else {
      v_dialog.classList.add("modal-xl");
    }
    if (!v_message_modal_animating) {
      if (p_content_function != null) p_content_function();
      $("#modal_message").modal("show");
    } else {
      v_message_modal_queued = true;
      v_message_modal_queued_function = p_content_function;
    }
  }
  function showError(p_message) {
    var v_content_div = document.getElementById("modal_message_content");
    var v_button_yes = document.getElementById("modal_message_yes");
    var v_button_ok = document.getElementById("modal_message_ok");
    var v_button_no = document.getElementById("modal_message_no");
    var v_button_cancel = document.getElementById("modal_message_cancel");
    v_content_div.textContent = p_message;
    v_button_yes.style.display = "none";
    v_button_ok.style.display = "";
    v_button_no.style.display = "none";
    v_button_cancel.style.display = "none";
    showMessageModal();
    setTimeout(function() {
      v_button_yes.focus();
    }, 500);
  }
  function showAlert$1(p_info, p_funcYes = null, p_large = null, p_is_html = false) {
    var v_create_content_function = function() {
      var v_content_div = document.getElementById("modal_message_content");
      var v_button_yes = document.getElementById("modal_message_yes");
      var v_button_ok = document.getElementById("modal_message_ok");
      var v_button_no = document.getElementById("modal_message_no");
      var v_button_cancel = document.getElementById("modal_message_cancel");
      if (p_is_html) {
        v_content_div.innerHTML = p_info;
      } else {
        v_content_div.textContent = p_info;
      }
      v_button_ok.onclick = function() {
        if (p_funcYes != null) p_funcYes();
      };
      v_button_yes.style.display = "none";
      v_button_ok.style.display = "";
      v_button_no.style.display = "none";
      v_button_cancel.style.display = "none";
    };
    showMessageModal(v_create_content_function, p_large);
  }
  function showConfirm(p_info, p_funcYes = null, p_funcNo = null, p_shownCallback = null, p_large = null) {
    var v_create_content_function = function() {
      if (p_shownCallback != null) v_shown_callback = p_shownCallback;
      var v_content_div = document.getElementById("modal_message_content");
      var v_button_yes = document.getElementById("modal_message_yes");
      var v_button_ok = document.getElementById("modal_message_ok");
      var v_button_no = document.getElementById("modal_message_no");
      var v_button_cancel = document.getElementById("modal_message_cancel");
      v_content_div.textContent = p_info;
      v_button_ok.onclick = function() {
        p_funcYes();
      };
      v_button_cancel.onclick = function() {
        if (p_funcNo) p_funcNo();
      };
      v_button_yes.style.display = "none";
      v_button_no.style.display = "none";
      v_button_ok.style.display = "";
      v_button_cancel.style.display = "";
    };
    showMessageModal(v_create_content_function, p_large);
  }
  function showConfirm2(p_info, p_funcYes, p_funcNo) {
    var v_content_div = document.getElementById("modal_message_content");
    var v_button_yes = document.getElementById("modal_message_yes");
    var v_button_ok = document.getElementById("modal_message_ok");
    var v_button_no = document.getElementById("modal_message_no");
    var v_button_cancel = document.getElementById("modal_message_cancel");
    v_content_div.textContent = p_info;
    v_button_yes.onclick = function() {
      p_funcYes();
    };
    v_button_no.onclick = function() {
      if (p_funcNo != null) {
        p_funcNo();
      }
    };
    v_button_cancel.onclick = function() {
    };
    v_button_yes.style.display = "";
    v_button_no.style.display = "";
    v_button_ok.style.display = "none";
    v_button_cancel.style.display = "";
    showMessageModal();
  }
  function showConfirm3(p_info, p_funcYes, p_funcNo) {
    var v_content_div = document.getElementById("modal_message_content");
    var v_button_yes = document.getElementById("modal_message_yes");
    var v_button_ok = document.getElementById("modal_message_ok");
    var v_button_no = document.getElementById("modal_message_no");
    var v_button_cancel = document.getElementById("modal_message_cancel");
    v_content_div.textContent = p_info;
    v_button_yes.onclick = function() {
      p_funcYes();
    };
    v_button_no.onclick = function() {
      if (p_funcNo != null) {
        p_funcNo();
      }
    };
    v_button_yes.style.display = "";
    v_button_no.style.display = "";
    v_button_ok.style.display = "none";
    v_button_cancel.style.display = "none";
    showMessageModal();
  }
  const notificationControl = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    checkSessionMessage,
    showAlert: showAlert$1,
    showConfirm,
    showConfirm2,
    showConfirm3,
    showError,
    showMessageModal
  }, Symbol.toStringTag, { value: "Module" }));
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
  function execAjax$1(p_url, p_data, p_successFunc, p_errorFunc, p_notifMode, p_loading, p_cancel_button, p_onAjaxErrorCallBack = false) {
    if (p_loading == null || p_loading == true) {
      startLoading();
    }
    if (v_cancel_button !== void 0) {
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
    execAjax: execAjax$1,
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
    var v_editable = event.target.closest && event.target.closest('input, textarea, [contenteditable="true"], [contenteditable=""]');
    if (!v_editable) {
      event.preventDefault();
    }
  });
  exposeGlobals(
    notificationControl,
    ajaxControl
  );
})();
//# sourceMappingURL=omnidb.login.js.map
