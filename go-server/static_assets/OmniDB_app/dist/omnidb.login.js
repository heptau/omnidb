(function() {
  "use strict";
  function exposeGlobals(...namespaces) {
    for (const ns of namespaces) {
      Object.assign(window, ns);
    }
  }
  function readLoginBootstrap() {
    if (typeof v_i18n !== "undefined" && v_i18n) return;
    var el2 = document.getElementById("omnidb_login_i18n");
    if (!el2 || !el2.textContent) return;
    var cfg = JSON.parse(el2.textContent);
    window.v_language = cfg.language;
    window.v_i18n = cfg.i18n;
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
  function applyStaticI18n() {
    if (typeof v_language !== "undefined" && v_language) {
      document.documentElement.setAttribute("lang", v_language);
    }
    document.documentElement.style.setProperty("--i18n-empty-suffix", JSON.stringify(" (" + t("login.empty_suffix") + ")"));
    document.querySelectorAll("[data-i18n]").forEach(function(el2) {
      var key = el2.getAttribute("data-i18n");
      if (key) el2.textContent = t(key);
    });
    ["title", "placeholder", "aria-label", "alt", "label"].forEach(function(attr) {
      document.querySelectorAll("[data-i18n-" + attr + "]").forEach(function(el2) {
        var key = el2.getAttribute("data-i18n-" + attr);
        if (key) el2.setAttribute(attr, t(key));
      });
    });
  }
  function initI18n() {
    readLoginBootstrap();
    applyStaticI18n();
  }
  var v_message_modal_animating, v_message_modal_queued, v_message_modal_queued_function, v_shown_callback;
  function el(id) {
    return (
      /** @type {HTMLElement} */
      document.getElementById(id)
    );
  }
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
  function initMessageModal() {
    v_message_modal_animating = false;
    v_message_modal_queued = false;
    v_message_modal_queued_function = null;
    v_shown_callback = null;
    var v_modal_message = el("modal_message");
    v_modal_message.addEventListener("hide.bs.modal", function(e) {
      v_message_modal_animating = true;
    });
    v_modal_message.addEventListener("show.bs.modal", function(e) {
      v_message_modal_animating = true;
    });
    v_modal_message.addEventListener("hidden.bs.modal", function(e) {
      el("modal_message_content").innerHTML = "";
      v_message_modal_animating = false;
      if (v_message_modal_queued == true) {
        if (v_message_modal_queued_function != null) v_message_modal_queued_function();
        bootstrap.Modal.getOrCreateInstance(v_modal_message).show();
      }
      v_message_modal_queued = false;
      v_message_modal_queued_function = null;
    });
    v_modal_message.addEventListener("shown.bs.modal", function(e) {
      v_message_modal_animating = false;
      if (v_shown_callback) {
        v_shown_callback();
        v_shown_callback = null;
      }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initMessageModal);
  else setTimeout(initMessageModal, 0);
  function showMessageModal(p_content_function, p_large) {
    var v_dialog = el("modal_message_dialog");
    var v_old_title = v_dialog.querySelector(".modal-header .modal-title");
    if (v_old_title) v_old_title.remove();
    v_dialog.classList.toggle("modal-xl", p_large === true);
    v_dialog.classList.toggle("omnidb__modal--form", p_large === "form");
    if (!v_message_modal_animating) {
      if (p_content_function != null) p_content_function();
      bootstrap.Modal.getOrCreateInstance(el("modal_message")).show();
    } else {
      v_message_modal_queued = true;
      v_message_modal_queued_function = p_content_function;
    }
  }
  function setMessageModalTitle(p_text, p_icon_class = null) {
    var v_header = el("modal_message_dialog").querySelector(".modal-header");
    if (!v_header) return;
    var v_title = document.createElement("h5");
    v_title.className = "modal-title";
    if (p_icon_class) {
      var v_icon = document.createElement("i");
      v_icon.className = p_icon_class;
      v_title.style.gap = "6px";
      v_title.appendChild(v_icon);
    }
    v_title.appendChild(document.createTextNode(p_text));
    v_header.insertBefore(v_title, v_header.firstChild);
  }
  function showError(p_message) {
    var v_content_div = el("modal_message_content");
    var v_button_yes = el("modal_message_yes");
    var v_button_ok = el("modal_message_ok");
    var v_button_no = el("modal_message_no");
    var v_button_cancel = el("modal_message_cancel");
    v_content_div.textContent = p_message;
    v_button_ok.textContent = t("common.ok");
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
      var v_content_div = el("modal_message_content");
      var v_button_yes = el("modal_message_yes");
      var v_button_ok = el("modal_message_ok");
      var v_button_no = el("modal_message_no");
      var v_button_cancel = el("modal_message_cancel");
      if (p_is_html) {
        v_content_div.innerHTML = p_info;
      } else {
        v_content_div.textContent = p_info;
      }
      v_button_ok.textContent = t("common.ok");
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
  function showConfirm(p_info, p_funcYes = null, p_funcNo = null, p_shownCallback = null, p_large = null, p_yes_label = null) {
    var v_create_content_function = function() {
      if (p_shownCallback != null) v_shown_callback = p_shownCallback;
      var v_content_div = el("modal_message_content");
      var v_button_yes = el("modal_message_yes");
      var v_button_ok = el("modal_message_ok");
      var v_button_no = el("modal_message_no");
      var v_button_cancel = el("modal_message_cancel");
      v_content_div.textContent = p_info;
      v_button_ok.textContent = p_yes_label || t("common.ok");
      v_button_ok.onclick = function() {
        if (p_funcYes != null) p_funcYes();
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
    var v_content_div = el("modal_message_content");
    var v_button_yes = el("modal_message_yes");
    var v_button_ok = el("modal_message_ok");
    var v_button_no = el("modal_message_no");
    var v_button_cancel = el("modal_message_cancel");
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
    var v_content_div = el("modal_message_content");
    var v_button_yes = el("modal_message_yes");
    var v_button_ok = el("modal_message_ok");
    var v_button_no = el("modal_message_no");
    var v_button_cancel = el("modal_message_cancel");
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
    setMessageModalTitle,
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
  function execAjax$1(p_url, p_data, p_successFunc, p_errorFunc, p_notifMode, p_loading, p_cancel_button, p_onAjaxErrorCallBack = false) {
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
      },
      error: function(msg) {
        if (p_loading == null || p_loading == true) {
          endLoading();
        }
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
      }
    });
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
    execAjax: execAjax$1,
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
  function validateField(field) {
    if (!field) return;
    const parent = field.parentElement;
    if (!parent) return;
    if (field.value !== null && field.value !== "") {
      parent.classList.remove("isEmpty");
    } else {
      parent.classList.add("isEmpty");
    }
  }
  const userField = () => (
    /** @type {HTMLInputElement} */
    document.getElementById("txt_user")
  );
  const pwdField = () => (
    /** @type {HTMLInputElement} */
    document.getElementById("txt_pwd")
  );
  function markEmptyFields() {
    let anyEmpty = false;
    for (const field of [userField(), pwdField()]) {
      if (!field || field.value === "") anyEmpty = true;
      validateField(field);
    }
    return anyEmpty;
  }
  function signIn() {
    const user = userField();
    const pwd = pwdField();
    user.blur();
    pwd.blur();
    if (markEmptyFields()) return;
    execAjax$1(
      "/sign_in/",
      JSON.stringify({ p_username: user.value, p_pwd: pwd.value }),
      function(p_return) {
        if (p_return.v_data >= 0) {
          window.open(v_url_folder + "/workspace", "_self");
        } else if (p_return.v_data == -2) {
          showAlert$1(t("login.invalid_token"));
        } else {
          showAlert$1(t("login.invalid_credentials"));
        }
      },
      null
    );
  }
  function initLoginPage() {
    checkSessionMessage();
    markEmptyFields();
    for (const field of [userField(), pwdField()]) {
      if (!field) continue;
      field.addEventListener("change", () => validateField(field));
      field.addEventListener("keydown", (event) => {
        if (event.key === "Enter") signIn();
      });
    }
    const signInButton = document.getElementById("bt_sign_in");
    if (signInButton) signInButton.addEventListener("click", () => signIn());
    if (v_cancel_button) {
      v_cancel_button.addEventListener("click", cancelAjax);
    }
  }
  initI18n();
  exposeGlobals(
    notificationControl,
    ajaxControl
  );
  initLoginPage();
})();
//# sourceMappingURL=omnidb.login.js.map
