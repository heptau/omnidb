(function() {
  function exposeGlobals(...namespaces) {
    for (const ns of namespaces) {
      Object.assign(window, ns);
    }
  }
  function getAllSnippets() {
    execAjax(
      "/get_all_snippets/",
      JSON.stringify({}),
      function(p_return) {
        v_connTabControl.tag.globalSnippets = p_return;
      },
      null,
      "box",
      false
    );
  }
  function getTreeSnippets$1(p_div) {
    var context_menu = {
      cm_node_root: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeSnippets(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "New Folder",
            icon: "fas cm-all fa-folder",
            action: function(node) {
              newNodeSnippet(node, "node");
            }
          },
          {
            text: "New Snippet",
            icon: "fas cm-all fa-align-left",
            action: function(node) {
              newNodeSnippet(node, "snippet");
            }
          }
        ]
      },
      cm_node: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeSnippets(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "New Folder",
            icon: "fas cm-all fa-folder",
            action: function(node) {
              newNodeSnippet(node, "node");
            }
          },
          {
            text: "New Snippet",
            icon: "fas cm-all fa-align-left",
            action: function(node) {
              newNodeSnippet(node, "snippet");
            }
          },
          {
            text: "Rename Folder",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              renameNodeSnippet(node);
            }
          },
          {
            text: "Delete Folder",
            icon: "fas cm-all fa-times",
            action: function(node) {
              deleteNodeSnippet(node);
            }
          }
        ]
      },
      cm_snippet: {
        elements: [
          {
            text: "Edit",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              startEditSnippetText(node);
            }
          },
          {
            text: "Rename",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              renameNodeSnippet(node);
            }
          },
          {
            text: "Delete",
            icon: "fas cm-all fa-times",
            action: function(node) {
              deleteNodeSnippet(node);
            }
          }
        ]
      }
    };
    var tree = createTree(p_div, "#fcfdfd", context_menu);
    tree.tag = {};
    tree.nodeAfterOpenEvent = function(node) {
      refreshTreeSnippets(node);
    };
    var node1 = tree.createNode(
      "Snippets",
      false,
      "fas node-all fa-list-alt node-snippet-list",
      null,
      { type: "node", id: null },
      "cm_node_root"
    );
    node1.createChildNode("", true, "node-spin", null, null);
    tree.drawTree();
    v_connTabControl.snippet_tree = tree;
  }
  function refreshTreeSnippets(node) {
    if (node.tag != void 0) {
      if (node.tag.type == "node") {
        getChildSnippetNodes(node);
      }
    }
  }
  function getChildSnippetNodes(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_node_children/",
      JSON.stringify({ p_sn_id_parent: node.tag.id }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        for (i = 0; i < p_return.v_data.v_list_nodes.length; i++) {
          var v_node2 = node.createChildNode(
            p_return.v_data.v_list_nodes[i].v_name,
            false,
            "fas node-all fa-folder node-snippet-folder",
            {
              type: "node",
              id: p_return.v_data.v_list_nodes[i].v_id,
              id_parent: node.tag.id,
              name: p_return.v_data.v_list_nodes[i].v_name
            },
            "cm_node"
          );
          v_node2.createChildNode("", true, "node-spin", null, null);
        }
        for (i = 0; i < p_return.v_data.v_list_texts.length; i++) {
          var v_node2 = node.createChildNode(
            p_return.v_data.v_list_texts[i].v_name,
            false,
            "fas node-all fa-align-left node-snippet-snippet",
            {
              type: "snippet",
              id: p_return.v_data.v_list_texts[i].v_id,
              id_parent: node.tag.id,
              name: p_return.v_data.v_list_texts[i].v_name
            },
            "cm_snippet"
          );
          v_node2.doubleClickNodeEvent = function(p_node) {
            startEditSnippetText(p_node);
          };
        }
      },
      null,
      "box",
      false
    );
  }
  function closeSnippetTab(p_tab) {
    p_tab.removeTab();
    if (p_tab.tag.ht != null) {
      p_tab.tag.ht.destroy();
      p_tab.tag.div_result.innerHTML = "";
    }
    if (p_tab.tag.editor != null) p_tab.tag.editor.destroy();
  }
  function saveSnippetText(event2) {
    var v_callback = function(p_return_object) {
      v_connTabControl.snippet_tag.tabControl.selectedTab.tag.snippetObject = p_return_object;
      v_connTabControl.snippet_tag.tabControl.selectedTab.tag.tab_title_span.textContent = p_return_object.name;
    };
    if (v_connTabControl.snippet_tag.tabControl.selectedTab.tag.snippetObject.id != null) {
      var v_save_object = {
        v_id: v_connTabControl.snippet_tag.tabControl.selectedTab.tag.snippetObject.id,
        v_name: v_connTabControl.snippet_tag.tabControl.selectedTab.tag.snippetObject.name,
        v_parent: v_connTabControl.snippet_tag.tabControl.selectedTab.tag.snippetObject.parent
      };
      saveSnippetTextConfirm(
        v_save_object,
        v_connTabControl.snippet_tag.tabControl.selectedTab.tag.editor.getValue(),
        v_callback
      );
    } else {
      customMenu(
        {
          x: event2.clientX + 5,
          y: event2.clientY + 5
        },
        buildSnippetContextMenuObjects$1(
          "save",
          v_connTabControl.tag.globalSnippets,
          v_connTabControl.snippet_tag.tabControl.selectedTab.tag.editor,
          v_callback
        ),
        null
      );
    }
  }
  function snippetTreeFindNode(p_id, p_current_node) {
    var v_node2 = null;
    for (var i2 = 0; i2 < p_current_node.childNodes.length; i2++) {
      if (p_current_node.childNodes[i2].tag.id == p_id) return p_current_node.childNodes[i2];
      else {
        v_node2 = snippetTreeFindNode(p_id, p_current_node.childNodes[i2]);
        if (v_node2 != null) return v_node2;
      }
    }
    return v_node2;
  }
  function saveSnippetTextConfirm(p_save_object, p_text, p_callback) {
    execAjax(
      "/save_snippet_text/",
      JSON.stringify({
        p_id: p_save_object.v_id,
        p_parent: p_save_object.v_parent,
        p_name: p_save_object.v_name,
        p_text
      }),
      function(p_return) {
        var v_node2 = null;
        if (p_return.v_data.parent == null) {
          v_node2 = v_connTabControl.snippet_tree.childNodes[0];
        } else {
          v_node2 = snippetTreeFindNode(p_return.v_data.parent, v_connTabControl.snippet_tree.childNodes[0]);
        }
        if (v_node2 != null) {
          if (v_node2.childNodes == 0) refreshTreeSnippets(v_node2);
          else {
            v_node2.collapseNode();
            v_node2.expandNode();
          }
        }
        if (p_callback != null) p_callback(p_return.v_data);
        showAlert("Snippet saved.");
        getAllSnippets();
      },
      null,
      "box"
    );
  }
  function newNodeSnippet(p_node, p_mode) {
    var v_placeholder = "Snippet Name";
    if (p_mode == "node") v_placeholder = "Node Name";
    showConfirm(
      "",
      function() {
        execAjax(
          "/new_node_snippet/",
          JSON.stringify({
            p_sn_id_parent: p_node.tag.id,
            p_mode,
            p_name: document.getElementById("element_name").value
          }),
          function(p_return) {
            refreshTreeSnippets(p_node);
            getAllSnippets();
          },
          null,
          "box"
        );
      },
      null,
      function() {
        var v_input = document.createElement("input");
        v_input.id = "element_name";
        v_input.className = "form-control";
        v_input.placeholder = v_placeholder;
        v_input.style.width = "100%";
        document.getElementById("modal_message_content").appendChild(v_input);
        v_input.onkeydown = function() {
          if (event.keyCode == 13) document.getElementById("modal_message_ok").click();
          else if (event.keyCode == 27) document.getElementById("modal_message_cancel").click();
        };
        v_input.focus();
        v_input.selectionStart = 0;
        v_input.selectionEnd = 1e4;
      }
    );
  }
  function renameNodeSnippet(p_node) {
    showConfirm(
      "",
      function() {
        execAjax(
          "/rename_node_snippet/",
          JSON.stringify({
            p_id: p_node.tag.id,
            p_mode: p_node.tag.type,
            p_name: document.getElementById("element_name").value
          }),
          function(p_return) {
            refreshTreeSnippets(p_node.parent);
            getAllSnippets();
          },
          null,
          "box"
        );
      },
      null,
      function() {
        var v_input = document.createElement("input");
        v_input.id = "element_name";
        v_input.className = "form-control";
        v_input.value = p_node.text;
        v_input.style.width = "100%";
        document.getElementById("modal_message_content").appendChild(v_input);
        v_input.onkeydown = function() {
          if (event.keyCode == 13) document.getElementById("modal_message_ok").click();
          else if (event.keyCode == 27) document.getElementById("modal_message_cancel").click();
        };
        v_input.focus();
        v_input.selectionStart = 0;
        v_input.selectionEnd = 1e4;
      }
    );
  }
  function deleteNodeSnippet(p_node) {
    showConfirm(
      "Are you sure you want to delete this " + p_node.tag.type + "?",
      function() {
        execAjax(
          "/delete_node_snippet/",
          JSON.stringify({ p_id: p_node.tag.id, p_mode: p_node.tag.type }),
          function(p_return) {
            refreshTreeSnippets(p_node.parent);
            getAllSnippets();
          },
          null,
          "box"
        );
      },
      null,
      function() {
        var v_input = document.getElementById("modal_message_ok");
        v_input.focus();
      }
    );
  }
  function startEditSnippetText(p_node) {
    var v_snippet_tab_list = v_connTabControl.snippet_tag.tabControl.tabList;
    var v_avaiable_tab = false;
    for (let i2 = 0; i2 < v_snippet_tab_list.length; i2++) {
      var v_snippet_tab_snippet_object = v_snippet_tab_list[i2].tag.snippetObject;
      if (typeof v_snippet_tab_snippet_object === "object") {
        if (v_snippet_tab_snippet_object.id === p_node.tag.id) {
          v_avaiable_tab = v_snippet_tab_list[i2];
        }
      }
    }
    if (v_avaiable_tab) {
      v_connTabControl.snippet_tag.tabControl.selectTab(v_avaiable_tab);
    } else {
      v_connTabControl.tag.createSnippetTextTab(p_node.tag);
    }
    execAjax(
      "/get_snippet_text/",
      JSON.stringify({ p_st_id: p_node.tag.id }),
      function(p_return) {
        v_connTabControl.snippet_tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data);
        v_connTabControl.snippet_tag.tabControl.selectedTab.tag.editor.clearSelection();
        v_connTabControl.snippet_tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
      },
      null,
      "box"
    );
  }
  function executeSnippet(p_id, p_editor) {
    execAjax(
      "/get_snippet_text/",
      JSON.stringify({ p_st_id: p_id }),
      function(p_return) {
        p_editor.insert(p_return.v_data);
        p_editor.clearSelection();
      },
      null,
      "box"
    );
  }
  function buildSnippetContextMenuObjects$1(p_mode, p_object, p_editor, p_callback) {
    var v_elements = [];
    if (p_mode == "save") {
      v_elements.push({
        text: "New Snippet",
        icon: "fas cm-all fa-save",
        action: function() {
          showConfirm(
            "",
            function() {
              saveSnippetTextConfirm(
                {
                  v_id: null,
                  v_name: document.getElementById("element_name").value,
                  v_parent: p_object.id
                },
                p_editor.getValue(),
                p_callback
              );
            },
            null,
            function() {
              var v_input = document.createElement("input");
              v_input.id = "element_name";
              v_input.className = "form-control";
              v_input.placeholder = "Snippet Name";
              v_input.style.width = "100%";
              document.getElementById("modal_message_content").appendChild(v_input);
              v_input.onkeydown = function() {
                if (event.keyCode == 13) document.getElementById("modal_message_ok").click();
                else if (event.keyCode == 27) document.getElementById("modal_message_cancel").click();
              };
              v_input.focus();
              v_input.selectionStart = 0;
              v_input.selectionEnd = 1e4;
            }
          );
        }
      });
    }
    for (var i2 = 0; i2 < p_object.files.length; i2++)
      (function(i3) {
        var v_file = p_object.files[i3];
        if (p_mode == "save")
          v_elements.push({
            text: "<b>OVERWRITE</b> " + v_file.name,
            icon: "fas cm-all fa-align-left",
            action: function() {
              showConfirm(
                "",
                function() {
                  saveSnippetTextConfirm(
                    {
                      v_id: v_file.id,
                      v_name: null,
                      v_parent: null
                    },
                    p_editor.getValue(),
                    p_callback
                  );
                },
                null,
                function() {
                  var v_content_div = document.getElementById("modal_message_content");
                  var v_bold = document.createElement("b");
                  v_bold.textContent = "WARNING";
                  v_content_div.appendChild(v_bold);
                  v_content_div.appendChild(document.createTextNode(", are you sure you want to overwrite file '" + v_file.name + "'?"));
                }
              );
            }
          });
        else
          v_elements.push({
            text: v_file.name,
            icon: "fas cm-all fa-align-left",
            action: function() {
              executeSnippet(v_file.id, p_editor);
            }
          });
      })(i2);
    for (var i2 = 0; i2 < p_object.folders.length; i2++)
      (function(i3) {
        var v_folder = p_object.folders[i3];
        v_elements.push({
          text: v_folder.name,
          icon: "fas cm-all fa-folder",
          submenu: {
            elements: buildSnippetContextMenuObjects$1(p_mode, v_folder, p_editor, p_callback)
          }
        });
      })(i2);
    return v_elements;
  }
  const treeSnippets = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    buildSnippetContextMenuObjects: buildSnippetContextMenuObjects$1,
    closeSnippetTab,
    deleteNodeSnippet,
    executeSnippet,
    getAllSnippets,
    getChildSnippetNodes,
    getTreeSnippets: getTreeSnippets$1,
    newNodeSnippet,
    refreshTreeSnippets,
    renameNodeSnippet,
    saveSnippetText,
    saveSnippetTextConfirm,
    snippetTreeFindNode,
    startEditSnippetText
  }, Symbol.toStringTag, { value: "Module" }));
  function tabSQLTemplate$1(p_tab_name, p_template, p_showTip = true) {
    v_connTabControl.tag.createQueryTab(p_tab_name);
    v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_template);
    v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
    v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
  }
  function tabAdvancedObjectSearch(node) {
    var v_name = "Advanced Object Search";
    v_connTabControl.selectedTab.tag.tabControl.removeTabIndex(v_connTabControl.selectedTab.tag.tabControl.tabList.length - 1);
    var v_tab = v_connTabControl.selectedTab.tag.tabControl.createTab(
      '<span id="tab_title">' + v_name + '</span><span id="tab_loading" style="visibility:hidden;"><i class="tab-icon node-spin"></i></span><i title="" id="tab_check" style="display: none;" class="fas fa-check-circle tab-icon icon-check"></i><i title="Close" id="tab_close" class="fas fa-times tab-icon icon-close"></i>',
      false,
      null,
      renameTab,
      null,
      null,
      true,
      function() {
        if (this.tag != null) {
          refreshHeights();
        }
        if (this.tag != null) {
          checkAdvancedObjectSearchStatus(this);
        }
      }
    );
    v_connTabControl.selectedTab.tag.tabControl.selectTab(v_tab);
    var v_tab_title_span = document.getElementById("tab_title");
    v_tab_title_span.id = "tab_title_" + v_tab.id;
    var v_tab_loading_span = document.getElementById("tab_loading");
    v_tab_loading_span.id = "tab_loading_" + v_tab.id;
    var v_tab_close_span = document.getElementById("tab_close");
    v_tab_close_span.id = "tab_close_" + v_tab.id;
    v_tab_close_span.onclick = function(e) {
      var v_current_tab = v_tab;
      customMenu(
        {
          x: e.clientX + 5,
          y: e.clientY + 5
        },
        [
          {
            text: "Confirm",
            icon: "fas cm-all fa-check",
            action: function() {
              removeTab(v_current_tab);
            }
          },
          {
            text: "Cancel",
            icon: "fas cm-all fa-times",
            action: function() {
            }
          }
        ],
        null
      );
    };
    var v_tab_check_span = document.getElementById("tab_check");
    v_tab_check_span.id = "tab_check_" + v_tab.id;
    var v_html = "<div id='txt_query_" + v_tab.id + "' style=' width: 100%; height: 400px; border: 1px solid #c3c3c3;'></div><div class='omnidb__resize-line__container' onmousedown='resizeVertical(event)' style='width: 100%; height: 5px; cursor: ns-resize;'><div class='resize_line_horizontal' style='height: 0px; border-bottom: 1px dashed #acc4e8;'></div><div style='height:5px;'></div></div><button id='bt_start_" + v_tab.id + "' class='bt_execute bt_icon_only' title='Run' style='margin-bottom: 5px; margin-right: 5px; display: inline-block; vertical-align: middle;'><i class='fas fa-play fa-light'></i></button><button id='bt_cancel_" + v_tab.id + "' class='bt_red' title='Cancel' style='margin-bottom: 5px; margin-left: 5px; display: none; vertical-align: middle;' onclick='cancelSQL();'>Cancel</button><div id='div_query_info_" + v_tab.id + "' class='query_info' style='display: inline-block; margin-left: 5px; vertical-align: middle;'></div>        <div id='query_result_tabs_" + v_tab.id + "'>            <ul>            <li id='query_result_tabs_" + v_tab.id + "_tab1'>Data</li>			</ul>			<div id='div_query_result_tabs_" + v_tab.id + "_tab1'><div id='div_result_" + v_tab.id + "' class='query_result' style='width: 100%; overflow: auto;'></div>			</div>";
    var v_div = document.getElementById("div_" + v_tab.id);
    v_div.innerHTML = v_html;
    document.createElement("div");
    var v_containerDiv = document.getElementById("txt_query_" + v_tab.id);
    v_containerDiv.style.display = "flex";
    v_containerDiv.className = "query_info";
    v_containerDiv.style.flexDirection = "column";
    v_containerDiv.style.overflow = "auto";
    var v_filterHeader = document.createElement("h3");
    v_filterHeader.innerHTML = "Text Filter";
    v_filterHeader.style.marginLeft = "10px";
    v_filterHeader.className = "query_info";
    v_filterHeader.style.marginBottom = "0px";
    v_filterHeader.style.flex = "0 0 auto";
    v_containerDiv.appendChild(v_filterHeader);
    var v_filterContainerDiv = document.createElement("div");
    v_filterContainerDiv.style.display = "flex";
    v_filterContainerDiv.style.flex = "0 0 auto";
    v_containerDiv.appendChild(v_filterContainerDiv);
    var v_inputFilter = document.createElement("input");
    v_inputFilter.type = "text";
    v_inputFilter.placeholder = "Type the pattern to be searched...";
    v_inputFilter.style.margin = "10px";
    v_inputFilter.style.flex = "1 0 auto";
    v_inputFilter.classList.add("advanced-object-search-input-text");
    v_filterContainerDiv.appendChild(v_inputFilter);
    var v_divCase = document.createElement("div");
    v_divCase.style.margin = "10px";
    v_divCase.style.flex = "0 0 auto";
    v_filterContainerDiv.appendChild(v_divCase);
    var v_inputCase = document.createElement("input");
    v_inputCase.type = "checkbox";
    v_inputCase.style.margin = "10px";
    v_inputCase.classList.add("advanced-object-search-input-case");
    v_divCase.appendChild(v_inputCase);
    var v_spanCase = document.createElement("span");
    v_spanCase.innerHTML = "Case-sensitive";
    v_spanCase.className = "query_info";
    v_divCase.appendChild(v_spanCase);
    var v_divRegex = document.createElement("div");
    v_divRegex.style.margin = "10px";
    v_divRegex.style.flex = "0 0 auto";
    v_filterContainerDiv.appendChild(v_divRegex);
    var v_inputRegex = document.createElement("input");
    v_inputRegex.type = "checkbox";
    v_inputRegex.style.margin = "10px";
    v_inputRegex.classList.add("advanced-object-search-input-regex");
    v_divRegex.appendChild(v_inputRegex);
    var v_spanRegex = document.createElement("span");
    v_spanRegex.innerHTML = "Regular Expression";
    v_divRegex.appendChild(v_spanRegex);
    var v_optionsHeader = document.createElement("h3");
    v_optionsHeader.innerHTML = "Categories Filter";
    v_optionsHeader.style.marginLeft = "10px";
    v_optionsHeader.style.marginBottom = "0px";
    v_optionsHeader.style.flex = "0 0 auto";
    v_containerDiv.appendChild(v_optionsHeader);
    var v_optionsContainerDiv = document.createElement("div");
    v_optionsContainerDiv.style.display = "grid";
    v_optionsContainerDiv.style.gridTemplateColumns = "1fr 1fr 1fr 1fr";
    v_optionsContainerDiv.style.gridRowGap = "10px";
    v_optionsContainerDiv.style.gridColumnGap = "10px";
    v_optionsContainerDiv.style.justifyItems = "start";
    v_optionsContainerDiv.style.boxSizing = "border-box";
    v_optionsContainerDiv.style.padding = "10px";
    v_containerDiv.appendChild(v_optionsContainerDiv);
    if (parseInt(getMajorVersionPostgresql(node.tree.tag.version)) >= 10) {
      var v_optionList = [
        {
          text: "Data",
          value: 1
        },
        {
          text: "FK Name",
          value: 2
        },
        {
          text: "Function Definition",
          value: 3
        },
        {
          text: "Function Name",
          value: 4
        },
        {
          text: "Index Name",
          value: 5
        },
        {
          text: "Materialized View Column Name",
          value: 6
        },
        {
          text: "Materialized View Name",
          value: 7
        },
        {
          text: "PK Name",
          value: 8
        },
        {
          text: "Schema Name",
          value: 9
        },
        {
          text: "Sequence Name",
          value: 10
        },
        {
          text: "Table Column Name",
          value: 11
        },
        {
          text: "Table Name",
          value: 12
        },
        {
          text: "Trigger Name",
          value: 13
        },
        {
          text: "Trigger Source",
          value: 14
        },
        {
          text: "Unique Name",
          value: 15
        },
        {
          text: "View Column Name",
          value: 16
        },
        {
          text: "View Name",
          value: 17
        },
        {
          text: "Check Name",
          value: 18
        },
        {
          text: "Rule Name",
          value: 19
        },
        {
          text: "Rule Definition",
          value: 20
        },
        {
          text: "Inherited Table Name",
          value: 21
        },
        {
          text: "Partition Name",
          value: 22
        },
        {
          text: "Role Name",
          value: 23
        },
        {
          text: "Tablespace Name",
          value: 24
        },
        {
          text: "Extension Name",
          value: 25
        },
        {
          text: "FK Column Name",
          value: 26
        },
        {
          text: "PK Column Name",
          value: 27
        },
        {
          text: "Unique Column Name",
          value: 28
        },
        {
          text: "Index Column Name",
          value: 29
        },
        {
          text: "Check Definition",
          value: 30
        },
        {
          text: "Table Trigger Name",
          value: 31
        },
        {
          text: "Materialized View Definition",
          value: 32
        },
        {
          text: "View Definition",
          value: 33
        },
        {
          text: "Type Name",
          value: 34
        },
        {
          text: "Domain Name",
          value: 35
        },
        {
          text: "Event Trigger Name",
          value: 36
        },
        {
          text: "Event Trigger Function Name",
          value: 37
        },
        {
          text: "Event Trigger Function Definition",
          value: 38
        },
        {
          text: "Procedure Name",
          value: 39
        },
        {
          text: "Procedure Definition",
          value: 40
        }
      ];
    } else if (parseInt(getMajorVersionPostgresql(node.tree.tag.version)) >= 10) {
      var v_optionList = [
        {
          text: "Data",
          value: 1
        },
        {
          text: "FK Name",
          value: 2
        },
        {
          text: "Function Definition",
          value: 3
        },
        {
          text: "Function Name",
          value: 4
        },
        {
          text: "Index Name",
          value: 5
        },
        {
          text: "Materialized View Column Name",
          value: 6
        },
        {
          text: "Materialized View Name",
          value: 7
        },
        {
          text: "PK Name",
          value: 8
        },
        {
          text: "Schema Name",
          value: 9
        },
        {
          text: "Sequence Name",
          value: 10
        },
        {
          text: "Table Column Name",
          value: 11
        },
        {
          text: "Table Name",
          value: 12
        },
        {
          text: "Trigger Name",
          value: 13
        },
        {
          text: "Trigger Source",
          value: 14
        },
        {
          text: "Unique Name",
          value: 15
        },
        {
          text: "View Column Name",
          value: 16
        },
        {
          text: "View Name",
          value: 17
        },
        {
          text: "Check Name",
          value: 18
        },
        {
          text: "Rule Name",
          value: 19
        },
        {
          text: "Rule Definition",
          value: 20
        },
        {
          text: "Inherited Table Name",
          value: 21
        },
        {
          text: "Partition Name",
          value: 22
        },
        {
          text: "Role Name",
          value: 23
        },
        {
          text: "Tablespace Name",
          value: 24
        },
        {
          text: "Extension Name",
          value: 25
        },
        {
          text: "FK Column Name",
          value: 26
        },
        {
          text: "PK Column Name",
          value: 27
        },
        {
          text: "Unique Column Name",
          value: 28
        },
        {
          text: "Index Column Name",
          value: 29
        },
        {
          text: "Check Definition",
          value: 30
        },
        {
          text: "Table Trigger Name",
          value: 31
        },
        {
          text: "Materialized View Definition",
          value: 32
        },
        {
          text: "View Definition",
          value: 33
        },
        {
          text: "Type Name",
          value: 34
        },
        {
          text: "Domain Name",
          value: 35
        },
        {
          text: "Event Trigger Name",
          value: 36
        },
        {
          text: "Event Trigger Function Name",
          value: 37
        },
        {
          text: "Event Trigger Function Definition",
          value: 38
        }
      ];
    } else {
      var v_optionList = [
        {
          text: "Data",
          value: 1
        },
        {
          text: "FK Name",
          value: 2
        },
        {
          text: "Function Definition",
          value: 3
        },
        {
          text: "Function Name",
          value: 4
        },
        {
          text: "Index Name",
          value: 5
        },
        {
          text: "Materialized View Column Name",
          value: 6
        },
        {
          text: "Materialized View Name",
          value: 7
        },
        {
          text: "PK Name",
          value: 8
        },
        {
          text: "Schema Name",
          value: 9
        },
        {
          text: "Sequence Name",
          value: 10
        },
        {
          text: "Table Column Name",
          value: 11
        },
        {
          text: "Table Name",
          value: 12
        },
        {
          text: "Trigger Name",
          value: 13
        },
        {
          text: "Trigger Source",
          value: 14
        },
        {
          text: "Unique Name",
          value: 15
        },
        {
          text: "View Column Name",
          value: 16
        },
        {
          text: "View Name",
          value: 17
        },
        {
          text: "Check Name",
          value: 18
        },
        {
          text: "Rule Name",
          value: 19
        },
        {
          text: "Rule Definition",
          value: 20
        },
        {
          text: "Inherited Table Name",
          value: 21
        },
        {
          text: "Role Name",
          value: 22
        },
        {
          text: "Tablespace Name",
          value: 23
        },
        {
          text: "Extension Name",
          value: 24
        },
        {
          text: "FK Column Name",
          value: 25
        },
        {
          text: "PK Column Name",
          value: 26
        },
        {
          text: "Unique Column Name",
          value: 27
        },
        {
          text: "Index Column Name",
          value: 28
        },
        {
          text: "Check Definition",
          value: 29
        },
        {
          text: "Table Trigger Name",
          value: 30
        },
        {
          text: "Materialized View Definition",
          value: 31
        },
        {
          text: "View Definition",
          value: 32
        },
        {
          text: "Type Name",
          value: 33
        },
        {
          text: "Domain Name",
          value: 34
        },
        {
          text: "Event Trigger Name",
          value: 35
        },
        {
          text: "Event Trigger Function Name",
          value: 36
        },
        {
          text: "Event Trigger Function Definition",
          value: 37
        }
      ];
    }
    var v_compare = function(a, b) {
      if (a.text < b.text) {
        return -1;
      } else if (a.text > b.text) {
        return 1;
      } else {
        return 0;
      }
    };
    v_optionList.sort(v_compare);
    var v_inputDataFilter = document.createElement("input");
    var v_dataFilterHeader = document.createElement("h3");
    for (var i2 = 0; i2 < v_optionList.length; i2++) {
      var v_divOption = document.createElement("div");
      v_optionsContainerDiv.appendChild(v_divOption);
      var v_inputOption = document.createElement("input");
      v_inputOption.type = "checkbox";
      v_inputOption.value = v_optionList[i2].text;
      v_inputOption.classList.add("advanced-object-search-input-option");
      v_divOption.appendChild(v_inputOption);
      if (v_optionList[i2].text == "Data") {
        v_inputOption.addEventListener(
          "click",
          function(p_inputDataFilter, p_dataFilterHeader, p_event) {
            p_inputDataFilter.disabled = !this.checked;
            if (!this.checked) {
              p_dataFilterHeader.style.opacity = "0.5";
            } else {
              p_dataFilterHeader.style.opacity = "";
            }
          }.bind(v_inputOption, v_inputDataFilter, v_dataFilterHeader)
        );
      }
      var v_spanOption = document.createElement("span");
      v_spanOption.textContent = v_optionList[i2].text;
      v_divOption.appendChild(v_spanOption);
    }
    var v_categoriesButtonsContainer = document.createElement("div");
    v_categoriesButtonsContainer.style.display = "flex";
    v_categoriesButtonsContainer.style.flex = "0 0 auto";
    v_containerDiv.appendChild(v_categoriesButtonsContainer);
    var v_buttonSelectAllCategories = document.createElement("button");
    v_buttonSelectAllCategories.style.margin = "10px";
    v_buttonSelectAllCategories.innerHTML = "Select All";
    v_buttonSelectAllCategories.addEventListener("click", function(p_event) {
      var v_grandParent = this.parentElement.parentElement;
      var v_categoryList = v_grandParent.querySelectorAll(".advanced-object-search-input-option");
      for (var i3 = 0; i3 < v_categoryList.length; i3++) {
        if (!v_categoryList[i3].checked) {
          v_categoryList[i3].click();
        }
      }
    });
    v_categoriesButtonsContainer.appendChild(v_buttonSelectAllCategories);
    var v_buttonUnselectAllCategories = document.createElement("button");
    v_buttonUnselectAllCategories.style.margin = "10px";
    v_buttonUnselectAllCategories.innerHTML = "Unselect All";
    v_buttonUnselectAllCategories.addEventListener("click", function(p_event) {
      var v_grandParent = this.parentElement.parentElement;
      var v_categoryList = v_grandParent.querySelectorAll(".advanced-object-search-input-option");
      for (var i3 = 0; i3 < v_categoryList.length; i3++) {
        if (v_categoryList[i3].checked) {
          v_categoryList[i3].click();
        }
      }
    });
    v_categoriesButtonsContainer.appendChild(v_buttonUnselectAllCategories);
    var v_schemasHeader = document.createElement("h3");
    v_schemasHeader.innerHTML = "Schemas Filter";
    v_schemasHeader.style.marginLeft = "10px";
    v_schemasHeader.style.marginBottom = "0px";
    v_schemasHeader.style.flex = "0 0 auto";
    v_containerDiv.appendChild(v_schemasHeader);
    var v_schemasContainerDiv = document.createElement("div");
    v_schemasContainerDiv.style.display = "grid";
    v_schemasContainerDiv.style.gridTemplateColumns = "1fr 1fr 1fr 1fr 1fr";
    v_schemasContainerDiv.style.gridRowGap = "10px";
    v_schemasContainerDiv.style.gridColumnGap = "10px";
    v_schemasContainerDiv.style.justifyItems = "start";
    v_schemasContainerDiv.style.boxSizing = "border-box";
    v_schemasContainerDiv.style.padding = "10px";
    v_containerDiv.appendChild(v_schemasContainerDiv);
    execAjax(
      "/get_schemas_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id
      }),
      function(p_schemasContainerDiv, p_return) {
        var v_schemaList = p_return.v_data;
        var v_compare2 = function(a, b) {
          if (a.v_name < b.v_name) {
            return -1;
          } else if (a.v_name > b.v_name) {
            return 1;
          } else {
            return 0;
          }
        };
        v_schemaList.sort(v_compare2);
        v_disconsiderSchemas = {
          information_schema: 1,
          omnidb: 1,
          pg_catalog: 1,
          pg_toast: 1
        };
        for (var i3 = 0; i3 < v_schemaList.length; i3++) {
          if (!(v_schemaList[i3].v_name in v_disconsiderSchemas) && v_schemaList[i3].v_name.search(/pg.*temp.*/) == -1) {
            var v_divSchema = document.createElement("div");
            p_schemasContainerDiv.appendChild(v_divSchema);
            var v_inputSchema = document.createElement("input");
            v_inputSchema.type = "checkbox";
            v_inputSchema.value = v_schemaList[i3].v_name;
            v_inputSchema.classList.add("advanced-object-search-input-schema");
            v_divSchema.appendChild(v_inputSchema);
            var v_spanSchema = document.createElement("span");
            v_spanSchema.textContent = v_schemaList[i3].v_name;
            v_divSchema.appendChild(v_spanSchema);
          }
        }
      }.bind(null, v_schemasContainerDiv),
      function(p_return) {
        showAlert(p_return.v_data);
      },
      "box",
      false
    );
    var v_schemasButtonsContainer = document.createElement("div");
    v_schemasButtonsContainer.style.display = "flex";
    v_schemasButtonsContainer.style.flex = "0 0 auto";
    v_containerDiv.appendChild(v_schemasButtonsContainer);
    var v_buttonSelectAllSchemas = document.createElement("button");
    v_buttonSelectAllSchemas.style.margin = "10px";
    v_buttonSelectAllSchemas.innerHTML = "Select All";
    v_buttonSelectAllSchemas.addEventListener("click", function(p_event) {
      var v_grandParent = this.parentElement.parentElement;
      var v_schemaList = v_grandParent.querySelectorAll(".advanced-object-search-input-schema");
      for (var i3 = 0; i3 < v_schemaList.length; i3++) {
        if (!v_schemaList[i3].checked) {
          v_schemaList[i3].click();
        }
      }
    });
    v_schemasButtonsContainer.appendChild(v_buttonSelectAllSchemas);
    var v_buttonUnselectAllSchemas = document.createElement("button");
    v_buttonUnselectAllSchemas.style.margin = "10px";
    v_buttonUnselectAllSchemas.innerHTML = "Unselect All";
    v_buttonUnselectAllSchemas.addEventListener("click", function(p_event) {
      var v_grandParent = this.parentElement.parentElement;
      var v_schemaList = v_grandParent.querySelectorAll(".advanced-object-search-input-schema");
      for (var i3 = 0; i3 < v_schemaList.length; i3++) {
        if (v_schemaList[i3].checked) {
          v_schemaList[i3].click();
        }
      }
    });
    v_schemasButtonsContainer.appendChild(v_buttonUnselectAllSchemas);
    v_dataFilterHeader.innerHTML = "Data Category Filter";
    v_dataFilterHeader.style.opacity = "0.5";
    v_dataFilterHeader.style.marginLeft = "10px";
    v_dataFilterHeader.style.marginBottom = "0px";
    v_dataFilterHeader.style.flex = "0 0 auto";
    v_containerDiv.appendChild(v_dataFilterHeader);
    var v_dataFilterContainerDiv = document.createElement("div");
    v_dataFilterContainerDiv.style.display = "flex";
    v_dataFilterContainerDiv.style.flex = "0 0 auto";
    v_containerDiv.appendChild(v_dataFilterContainerDiv);
    v_inputDataFilter.type = "text";
    v_inputDataFilter.disabled = true;
    v_inputDataFilter.placeholder = "Type the filter to be applied to data category...";
    v_inputDataFilter.style.margin = "10px";
    v_inputDataFilter.style.flex = "1 0 auto";
    v_inputDataFilter.classList.add("advanced-object-search-data-input-text");
    v_dataFilterContainerDiv.appendChild(v_inputDataFilter);
    var v_buttonStart = document.getElementById("bt_start_" + v_tab.id);
    v_buttonStart.addEventListener("click", function(p_event) {
      if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.state != v_queryState.Idle) {
        showAlert("Tab with activity in progress.");
      } else {
        var v_parent = this.parentElement;
        var v_data = {
          text: "",
          regex: false,
          caseSensitive: false,
          categoryList: [],
          schemaList: [],
          dataCategoryFilter: ""
        };
        var v_inputFilter2 = v_parent.querySelector(".advanced-object-search-input-text");
        if (v_inputFilter2 != null) {
          v_data.text = v_inputFilter2.value;
        }
        if (v_data.text.trim() == "") {
          showAlert("Please, provide a string in order to search.");
          return;
        }
        var v_inputCase2 = v_parent.querySelector(".advanced-object-search-input-case");
        if (v_inputCase2 != null) {
          v_data.caseSensitive = v_inputCase2.checked;
        }
        var v_inputRegex2 = v_parent.querySelector(".advanced-object-search-input-regex");
        if (v_inputRegex2 != null) {
          v_data.regex = v_inputRegex2.checked;
        }
        var v_categoryList = v_parent.querySelectorAll(".advanced-object-search-input-option");
        for (var i3 = 0; i3 < v_categoryList.length; i3++) {
          if (v_categoryList[i3].checked) {
            v_data.categoryList.push(v_categoryList[i3].value);
            if (v_categoryList[i3].value == "Data") {
              var v_dataInputFilter = v_parent.querySelector(".advanced-object-search-data-input-text");
              if (v_dataInputFilter != null) {
                v_data.dataCategoryFilter = v_dataInputFilter.value;
              }
            }
          }
        }
        if (v_data.categoryList.length == 0) {
          showAlert("Please, select at least one category to search.");
          return;
        }
        var v_schemaList = v_parent.querySelectorAll(".advanced-object-search-input-schema");
        for (var i3 = 0; i3 < v_schemaList.length; i3++) {
          if (v_schemaList[i3].checked) {
            v_data.schemaList.push(v_schemaList[i3].value);
          }
        }
        if (v_data.schemaList.length == 0) {
          showAlert("Please, select at least one schema to search.");
          return;
        }
        if (v_data.categoryList.indexOf("Data") != -1) {
          showConfirm(
            'You have selected the category "Data". Please, be aware that it can consume a considerable amount of time, depending on selected schemas size. Do you want to proceed?',
            function(p_data) {
              queryAdvancedObjectSearch(p_data);
            }.bind(null, v_data)
          );
        } else {
          queryAdvancedObjectSearch(v_data);
        }
      }
    });
    var v_curr_tabs = createTabControl("query_result_tabs_" + v_tab.id, 0, null);
    var v_tab_db_id = null;
    var v_tag = {
      tab_id: v_tab.id,
      mode: "data_mining",
      editorDivId: "txt_query_" + v_tab.id,
      query_info: document.getElementById("div_query_info_" + v_tab.id),
      div_result: document.getElementById("div_result_" + v_tab.id),
      div_notices: document.getElementById("div_notices_" + v_tab.id),
      div_count_notices: document.getElementById("query_result_tabs_count_notices_" + v_tab.id),
      sel_filtered_data: document.getElementById("sel_filtered_data_" + v_tab.id),
      sel_export_type: document.getElementById("sel_export_type_" + v_tab.id),
      tab_title_span: v_tab_title_span,
      tab_loading_span: v_tab_loading_span,
      tab_close_span: v_tab_close_span,
      tab_check_span: v_tab_check_span,
      bt_start: document.getElementById("bt_start_" + v_tab.id),
      bt_cancel: document.getElementById("bt_cancel_" + v_tab.id),
      state: 0,
      context: null,
      tabControl: v_connTabControl.selectedTab.tag.tabControl,
      queryTabControl: v_curr_tabs,
      currQueryTab: null,
      connTab: v_connTabControl.selectedTab,
      currDatabaseIndex: null,
      tab_db_id: v_tab_db_id
    };
    v_tab.tag = v_tag;
    var v_selectDataTabFunc = function() {
      v_curr_tabs.selectTabIndex(0);
      v_tag.currQueryTab = "data";
      refreshHeights();
    };
    v_tag.selectDataTabFunc = v_selectDataTabFunc;
    v_curr_tabs.tabList[0].elementLi.onclick = v_selectDataTabFunc;
    v_selectDataTabFunc();
    var v_add_tab = v_connTabControl.selectedTab.tag.tabControl.createTab(
      "+",
      false,
      function(e) {
        showMenuNewTab(e);
      },
      null,
      null,
      null,
      null,
      null,
      false
    );
    v_add_tab.tag = {
      mode: "add"
    };
    setTimeout(function() {
      refreshHeights();
    }, 10);
    var v_instance1 = new Tooltip($(v_connTabControl.selectedTab.tag.tabControl.selectedLi), {
      title: "Adjust parameters and run!",
      placement: "top",
      container: "body"
    });
    v_instance1.show();
    window.setTimeout(function() {
      v_instance1.dispose();
    }, 4e3);
    new Tooltip($(".advanced-object-search-input-text"), {
      title: '<div style="text-align: left;">If Regular Expression is not selected, the pattern will work as follows:<br /><br />- if it does not contain sql % wildcard, it will put your pattern between two % <br /><br />- else it will consider your pattern as it is.</div>',
      placement: "bottom",
      container: "body",
      html: true
    });
    new Tooltip($(".advanced-object-search-data-input-text"), {
      title: '<div style="text-align: left;">If Data category is selected you can use it to filter search space and get a faster response.<br /><br />If you want to filter you must fill it with a | separeted list of patterns that may use % wildcard.<br /><br />For example: public.%mytable%|mysch%ema.% will search for data just in tables that match given patterns.</div>',
      placement: "top",
      container: "body",
      html: true
    });
  }
  function getTreePostgresql(p_div) {
    var context_menu = {
      cm_server: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          }
        ]
      },
      cm_databases: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Database",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Create Database", node.tree.tag.create_database);
            }
          },
          {
            text: "Doc: Databases",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Databases",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/managing-databases.html"
              );
            }
          }
        ]
      },
      cm_database: {
        elements: [
          {
            text: "Alter Database",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Alter Database", node.tree.tag.alter_database.replace("#database_name#", node.text));
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Database",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1("Drop Database", node.tree.tag.drop_database.replace("#database_name#", node.text));
            }
          }
        ]
      },
      cm_tablespaces: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Tablespace",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Create Tablespace", node.tree.tag.create_tablespace);
            }
          },
          {
            text: "Doc: Tablespaces",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Tablespaces",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/manage-ag-tablespaces.html"
              );
            }
          }
        ]
      },
      cm_tablespace: {
        elements: [
          {
            text: "Alter Tablespace",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Alter Tablespace", node.tree.tag.alter_tablespace.replace("#tablespace_name#", node.text));
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Tablespace",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1("Drop Tablespace", node.tree.tag.drop_tablespace.replace("#tablespace_name#", node.text));
            }
          }
        ]
      },
      cm_roles: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Role",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Create Role", node.tree.tag.create_role);
            }
          },
          {
            text: "Doc: Roles",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Roles",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/user-manag.html"
              );
            }
          }
        ]
      },
      cm_role: {
        elements: [
          {
            text: "Change Password",
            icon: "fas cm-all fa-key",
            action: function(node) {
              function buildPasswordField(p_label_text, p_input_id, p_placeholder) {
                var v_col = document.createElement("div");
                v_col.className = "col-md-12 mb-3";
                var v_label = document.createElement("label");
                v_label.setAttribute("for", p_input_id);
                v_label.textContent = p_label_text;
                var v_input = document.createElement("input");
                v_input.type = "password";
                v_input.id = p_input_id;
                v_input.className = "form-control";
                v_input.placeholder = p_placeholder;
                v_col.appendChild(v_label);
                v_col.appendChild(v_input);
                return v_col;
              }
              showConfirm(
                "",
                function(p_node) {
                  var v_password = document.getElementById("change_pwd_role").value;
                  var v_password_confirm = document.getElementById("change_pwd_role_confirm").value;
                  if (v_password == "") {
                    showAlert("Password is empty.");
                    return;
                  }
                  if (v_password_confirm == "") {
                    showAlert("Password confirmation is empty.");
                    return;
                  }
                  if (v_password != v_password_confirm) {
                    showAlert("Passwords do not match.");
                    return;
                  }
                  execAjax(
                    "/change_role_password_postgresql/",
                    JSON.stringify({
                      p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
                      p_tab_id: v_connTabControl.selectedTab.id,
                      p_role: p_node.text,
                      p_password: v_password
                    }),
                    function(p_return) {
                      showAlert("Password changed successfully.");
                    },
                    function(p_return) {
                      showAlert(p_return.v_data.message);
                    },
                    "box",
                    false
                  );
                }.bind(null, node),
                null,
                function() {
                  var v_row = document.createElement("div");
                  v_row.className = "form-row";
                  v_row.appendChild(buildPasswordField("Password", "change_pwd_role", "password"));
                  v_row.appendChild(buildPasswordField("Password confirmation", "change_pwd_role_confirm", "password confirmation"));
                  document.getElementById("modal_message_content").appendChild(v_row);
                }
              );
            }
          },
          {
            text: "Alter Role",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Alter Role", node.tree.tag.alter_role.replace("#role_name#", node.text));
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Role",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1("Drop Role", node.tree.tag.drop_role.replace("#role_name#", node.text));
            }
          }
        ]
      },
      cm_extensions: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Extension",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Create Extension", node.tree.tag.create_extension);
            }
          },
          {
            text: "Doc: Extensions",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Extensions",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/extend-extensions.html"
              );
            }
          }
        ]
      },
      cm_extension: {
        elements: [
          {
            text: "Alter Extension",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Alter Extension", node.tree.tag.alter_extension.replace("#extension_name#", node.text));
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Extension",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1("Drop Role", node.tree.tag.drop_extension.replace("#extension_name#", node.text));
            }
          }
        ]
      },
      cm_schemas: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Schema",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Create Schema", node.tree.tag.create_schema);
            }
          },
          {
            text: "Doc: Schemas",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Schemas",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/ddl-schemas.html"
              );
            }
          }
        ]
      },
      cm_schema: {
        elements: [
          {
            text: "Render Graph",
            icon: "fab cm-all fa-hubspot",
            action: function(node) {
            },
            submenu: {
              elements: [
                {
                  text: "Simple Graph",
                  icon: "fab cm-all fa-hubspot",
                  action: function(node) {
                    v_connTabControl.tag.createGraphTab(node.text);
                    drawGraph(false, node.text);
                  }
                },
                {
                  text: "Complete Graph",
                  icon: "fab cm-all fa-hubspot",
                  action: function(node) {
                    v_connTabControl.tag.createGraphTab(node.text);
                    drawGraph(true, node.text);
                  }
                }
              ]
            }
          },
          {
            text: "Alter Schema",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Alter Schema", node.tree.tag.alter_schema.replace("#schema_name#", node.text));
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Schema",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1("Drop Schema", node.tree.tag.drop_schema.replace("#schema_name#", node.text));
            }
          }
        ]
      },
      cm_tables: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Table",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Create Table", node.tree.tag.create_table.replace("#schema_name#", node.tag.schema));
            }
          },
          {
            text: "Doc: Basics",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Table Basics",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/ddl-basics.html"
              );
            }
          },
          {
            text: "Doc: Constraints",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Table Constraints",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/ddl-constraints.html"
              );
            }
          },
          {
            text: "Doc: Modifying",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Modifying Tables",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/ddl-alter.html"
              );
            }
          }
        ]
      },
      cm_table: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Data Actions",
            icon: "fas cm-all fa-list",
            submenu: {
              elements: [
                {
                  text: "Query Data",
                  icon: "fas cm-all fa-search",
                  action: function(node) {
                    TemplateSelectPostgresql(node.tag.schema, node.text, "t");
                  }
                },
                {
                  text: "Edit Data",
                  icon: "fas cm-all fa-table",
                  action: function(node) {
                    v_startEditData(node.text, node.tag.schema);
                  }
                },
                {
                  text: "Insert Record",
                  icon: "fas cm-all fa-edit",
                  action: function(node) {
                    TemplateInsertPostgresql(node.tag.schema, node.text);
                  }
                },
                {
                  text: "Update Records",
                  icon: "fas cm-all fa-edit",
                  action: function(node) {
                    TemplateUpdatePostgresql(node.tag.schema, node.text);
                  }
                },
                {
                  text: "Delete Records",
                  icon: "fas cm-all fa-times",
                  action: function(node) {
                    tabSQLTemplate$1(
                      "Delete Records",
                      node.tree.tag.delete.replace("#table_name#", node.tag.schema + "." + node.text)
                    );
                  }
                },
                {
                  text: "Truncate Table",
                  icon: "fas cm-all fa-cut",
                  action: function(node) {
                    tabSQLTemplate$1(
                      "Truncate Table",
                      node.tree.tag.truncate.replace("#table_name#", node.tag.schema + "." + node.text)
                    );
                  }
                }
              ]
            }
          },
          {
            text: "Table Actions",
            icon: "fas cm-all fa-list",
            submenu: {
              elements: [
                {
                  text: "Vacuum Table",
                  icon: "fas cm-all fa-broom",
                  action: function(node) {
                    tabSQLTemplate$1(
                      "Vacuum Table",
                      node.tree.tag.vacuum_table.replace("#table_name#", node.tag.schema + "." + node.text)
                    );
                  }
                },
                {
                  text: "Analyze Table",
                  icon: "fas cm-all fa-search-plus",
                  action: function(node) {
                    tabSQLTemplate$1(
                      "Analyze Table",
                      node.tree.tag.analyze_table.replace("#table_name#", node.tag.schema + "." + node.text)
                    );
                  }
                },
                {
                  text: "Alter Table",
                  icon: "fas cm-all fa-edit",
                  action: function(node) {
                    tabSQLTemplate$1(
                      "Alter Table",
                      node.tree.tag.alter_table.replace("#table_name#", node.tag.schema + "." + node.text)
                    );
                  }
                },
                {
                  text: "Edit Comment",
                  icon: "fas cm-all fa-edit",
                  action: function(node) {
                    getObjectDescriptionPostgresql(node);
                  }
                },
                {
                  text: "Drop Table",
                  icon: "fas cm-all fa-times",
                  action: function(node) {
                    tabSQLTemplate$1(
                      "Drop Table",
                      node.tree.tag.drop_table.replace("#table_name#", node.tag.schema + "." + node.text)
                    );
                  }
                }
              ]
            }
          }
        ]
      },
      cm_inherited_tables: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Doc: Inheritance",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Table Inheritance",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/tutorial-inheritance.html"
              );
            }
          }
        ]
      },
      cm_partitioned_tables: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Doc: Partitioning",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Table Partitioning",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/ddl-partitioning.html.html"
              );
            }
          }
        ]
      },
      cm_columns: {
        elements: [
          {
            text: "Create Column",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Create Column",
                node.tree.tag.create_column.replace("#table_name#", node.tag.schema + "." + node.parent.text)
              );
            }
          }
        ]
      },
      cm_column: {
        elements: [
          {
            text: "Alter Column",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Alter Column",
                node.tree.tag.alter_column.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text).replace(/#column_name#/g, node.text)
              );
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Column",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1(
                "Drop Column",
                node.tree.tag.drop_column.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text).replace(/#column_name#/g, node.text)
              );
            }
          }
        ]
      },
      cm_pks: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Primary Key",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Create Primary Key",
                node.tree.tag.create_primarykey.replace("#table_name#", node.tag.schema + "." + node.parent.text)
              );
            }
          }
        ]
      },
      cm_pk: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Primary Key",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1(
                "Drop Primary Key",
                node.tree.tag.drop_primarykey.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text).replace("#constraint_name#", node.text)
              );
            }
          }
        ]
      },
      cm_fks: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Foreign Key",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Create Foreign Key",
                node.tree.tag.create_foreignkey.replace("#table_name#", node.tag.schema + "." + node.parent.text)
              );
            }
          }
        ]
      },
      cm_fk: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Foreign Key",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1(
                "Drop Foreign Key",
                node.tree.tag.drop_foreignkey.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text).replace("#constraint_name#", node.text)
              );
            }
          }
        ]
      },
      cm_uniques: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Unique",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Create Unique",
                node.tree.tag.create_unique.replace("#table_name#", node.tag.schema + "." + node.parent.text)
              );
            }
          }
        ]
      },
      cm_unique: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Unique",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1(
                "Drop Unique",
                node.tree.tag.drop_unique.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text).replace("#constraint_name#", node.text)
              );
            }
          }
        ]
      },
      cm_indexes: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Index",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Create Index",
                node.tree.tag.create_index.replace("#table_name#", node.tag.schema + "." + node.parent.text)
              );
            }
          },
          {
            text: "Doc: Indexes",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Indexes",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/indexes.html"
              );
            }
          }
        ]
      },
      cm_index: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Alter Index",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Alter Index",
                node.tree.tag.alter_index.replace(
                  "#index_name#",
                  node.tag.schema + "." + node.text.replace(" (Unique)", "").replace(" (Non Unique)", "")
                )
              );
            }
          },
          {
            text: "Reindex",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Reindex",
                node.tree.tag.reindex.replace(
                  "#index_name#",
                  node.tag.schema + "." + node.text.replace(" (Unique)", "").replace(" (Non Unique)", "")
                )
              );
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Index",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1(
                "Drop Index",
                node.tree.tag.drop_index.replace(
                  "#index_name#",
                  node.tag.schema + "." + node.text.replace(" (Unique)", "").replace(" (Non Unique)", "")
                )
              );
            }
          }
        ]
      },
      cm_checks: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Check",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Create Check",
                node.tree.tag.create_check.replace("#table_name#", node.tag.schema + "." + node.parent.text)
              );
            }
          }
        ]
      },
      cm_check: {
        elements: [
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Check",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1(
                "Drop Check",
                node.tree.tag.drop_check.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text).replace("#constraint_name#", node.text)
              );
            }
          }
        ]
      },
      cm_excludes: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Exclude",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Create Exclude",
                node.tree.tag.create_exclude.replace("#table_name#", node.tag.schema + "." + node.parent.text)
              );
            }
          }
        ]
      },
      cm_exclude: {
        elements: [
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Exclude",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1(
                "Drop Exclude",
                node.tree.tag.drop_exclude.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text).replace("#constraint_name#", node.text)
              );
            }
          }
        ]
      },
      cm_rules: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Rule",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Create Rule",
                node.tree.tag.create_rule.replace("#table_name#", node.tag.schema + "." + node.parent.text)
              );
            }
          },
          {
            text: "Doc: Rules",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Rules",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/rules.html"
              );
            }
          }
        ]
      },
      cm_rule: {
        elements: [
          {
            text: "Alter Rule",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Alter Rule",
                node.tree.tag.alter_rule.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text).replace("#rule_name#", node.text)
              );
            }
          },
          {
            text: "Edit Rule",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              v_connTabControl.tag.createQueryTab(node.text);
              getRuleDefinitionPostgresql(node);
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Rule",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1(
                "Drop Rule",
                node.tree.tag.drop_rule.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text).replace("#rule_name#", node.text)
              );
            }
          }
        ]
      },
      cm_triggers: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Trigger",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Create Trigger",
                node.tree.tag.create_trigger.replace("#table_name#", node.tag.schema + "." + node.parent.text)
              );
            }
          },
          {
            text: "Doc: Triggers",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Triggers",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/trigger-definition.html"
              );
            }
          }
        ]
      },
      cm_view_triggers: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Trigger",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Create Trigger",
                node.tree.tag.create_view_trigger.replace("#table_name#", node.tag.schema + "." + node.parent.text)
              );
            }
          },
          {
            text: "Doc: Triggers",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Triggers",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/trigger-definition.html"
              );
            }
          }
        ]
      },
      cm_trigger: {
        elements: [
          {
            text: "Alter Trigger",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Alter Trigger",
                node.tree.tag.alter_trigger.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text).replace("#trigger_name#", node.text)
              );
            }
          },
          {
            text: "Enable Trigger",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Enable Trigger",
                node.tree.tag.enable_trigger.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text).replace("#trigger_name#", node.text)
              );
            }
          },
          {
            text: "Disable Trigger",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Disable Trigger",
                node.tree.tag.disable_trigger.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text).replace("#trigger_name#", node.text)
              );
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Trigger",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1(
                "Drop Trigger",
                node.tree.tag.drop_trigger.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text).replace("#trigger_name#", node.text)
              );
            }
          }
        ]
      },
      cm_eventtriggers: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Event Trigger",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Create Event Trigger", node.tree.tag.create_eventtrigger);
            }
          },
          {
            text: "Doc: Event Triggers",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Event Triggers",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/event-triggers.html"
              );
            }
          }
        ]
      },
      cm_eventtrigger: {
        elements: [
          {
            text: "Alter Event Trigger",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Alter Trigger", node.tree.tag.alter_eventtrigger.replace("#trigger_name#", node.text));
            }
          },
          {
            text: "Enable Event Trigger",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Enable Event Trigger",
                node.tree.tag.enable_eventtrigger.replace("#trigger_name#", node.text)
              );
            }
          },
          {
            text: "Disable Event Trigger",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Disable Event Trigger",
                node.tree.tag.disable_eventtrigger.replace("#trigger_name#", node.text)
              );
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Event Trigger",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1("Drop Event Trigger", node.tree.tag.drop_eventtrigger.replace("#trigger_name#", node.text));
            }
          }
        ]
      },
      cm_inheriteds: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Inherited",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Create Inherited",
                node.tree.tag.create_inherited.replace("#table_name#", node.tag.schema + "." + node.parent.text)
              );
            }
          },
          {
            text: "Doc: Partitioning",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Partitioning",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/ddl-partitioning.html"
              );
            }
          }
        ]
      },
      cm_inherited: {
        elements: [
          {
            text: "No Inherit Table",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "No Inherit Partition",
                node.tree.tag.noinherit_partition.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text).replace("#partition_name#", node.text)
              );
            }
          },
          {
            text: "Drop Inherited",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1("Drop Partition", node.tree.tag.drop_partition.replace("#partition_name#", node.text));
            }
          }
        ]
      },
      cm_partitions: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Partition",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Create Partition",
                node.tree.tag.create_partition.replace("#table_name#", node.tag.schema + "." + node.parent.text)
              );
            }
          },
          {
            text: "Doc: Partitioning",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Partitioning",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/ddl-partitioning.html"
              );
            }
          }
        ]
      },
      cm_partition: {
        elements: [
          {
            text: "Detach Partition",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Detach Partition",
                node.tree.tag.detach_partition.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text).replace("#partition_name#", node.text)
              );
            }
          },
          {
            text: "Drop Partition",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1("Drop Partition", node.tree.tag.drop_partition.replace("#partition_name#", node.text));
            }
          }
        ]
      },
      cm_statistics: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Statistics",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Create Statistics",
                node.tree.tag.create_statistics.replace("#table_name#", node.tag.schema + "." + node.parent.text).replace("#schema_name#", node.tag.schema)
              );
            }
          },
          {
            text: "Doc: Statistics",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Statistics",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/planner-stats.html"
              );
            }
          }
        ]
      },
      cm_statistic: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Alter Statistics",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Alter Statistics", node.tree.tag.alter_statistics.replace("#statistics_name#", node.text));
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Statistics",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1("Drop Statistics", node.tree.tag.drop_statistics.replace("#statistics_name#", node.text));
            }
          }
        ]
      },
      cm_functions: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Function",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Create Function", node.tree.tag.create_function.replace("#schema_name#", node.tag.schema));
            }
          },
          {
            text: "Doc: Functions",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Functions",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/sql-createfunction.html"
              );
            }
          }
        ]
      },
      cm_function: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Select Function",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              TemplateSelectFunctionPostgresql(node.tag.schema, node.text, node.tag.id);
            }
          },
          {
            text: "Edit Function",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              v_connTabControl.tag.createQueryTab(node.text);
              getFunctionDefinitionPostgresql(node);
            }
          },
          {
            text: "Alter Function",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Alter Function", node.tree.tag.alter_function.replace("#function_name#", node.tag.id));
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Function",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1("Drop Function", node.tree.tag.drop_function.replace("#function_name#", node.tag.id));
            }
          }
        ]
      },
      cm_procedures: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Procedure",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Create Procedure", node.tree.tag.create_procedure.replace("#schema_name#", node.tag.schema));
            }
          },
          {
            text: "Doc: Procedures",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Procedures",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/sql-createprocedure.html"
              );
            }
          }
        ]
      },
      cm_procedure: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Call Procedure",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              TemplateCallProcedurePostgresql(node.tag.schema, node.text, node.tag.id);
            }
          },
          {
            text: "Edit Procedure",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              v_connTabControl.tag.createQueryTab(node.text);
              getProcedureDefinitionPostgresql(node);
            }
          },
          {
            text: "Alter Procedure",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Alter Procedure", node.tree.tag.alter_procedure.replace("#procedure_name#", node.tag.id));
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Procedure",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1("Drop Procedure", node.tree.tag.drop_procedure.replace("#procedure_name#", node.tag.id));
            }
          }
        ]
      },
      cm_triggerfunctions: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Trigger Function",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Create Trigger Function",
                node.tree.tag.create_triggerfunction.replace("#schema_name#", node.tag.schema)
              );
            }
          },
          {
            text: "Doc: Trigger Functions",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Trigger Functions",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/plpgsql-trigger.html"
              );
            }
          }
        ]
      },
      cm_triggerfunction: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Edit Trigger Function",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              v_connTabControl.tag.createQueryTab(node.text);
              getTriggerFunctionDefinitionPostgresql(node);
            }
          },
          {
            text: "Alter Trigger Function",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Alter Trigger Function",
                node.tree.tag.alter_triggerfunction.replace("#function_name#", node.tag.id)
              );
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Trigger Function",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1(
                "Drop Trigger Function",
                node.tree.tag.drop_triggerfunction.replace("#function_name#", node.tag.id)
              );
            }
          }
        ]
      },
      cm_direct_triggerfunction: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Edit Trigger Function",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              v_connTabControl.tag.createQueryTab(node.text);
              getTriggerFunctionDefinitionPostgresql(node);
            }
          },
          {
            text: "Alter Trigger Function",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Alter Trigger Function",
                node.tree.tag.alter_triggerfunction.replace("#function_name#", node.tag.id)
              );
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Trigger Function",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1(
                "Drop Trigger Function",
                node.tree.tag.drop_triggerfunction.replace("#function_name#", node.tag.id)
              );
            }
          }
        ]
      },
      cm_eventtriggerfunctions: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Event Trigger Function",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Create Event Trigger Function",
                node.tree.tag.create_eventtriggerfunction.replace("#schema_name#", node.tag.schema)
              );
            }
          },
          {
            text: "Doc: Event Trigger Functions",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Event Trigger Functions",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/functions-event-triggers.html"
              );
            }
          }
        ]
      },
      cm_eventtriggerfunction: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Edit Event Trigger Function",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              v_connTabControl.tag.createQueryTab(node.text);
              getEventTriggerFunctionDefinitionPostgresql(node);
            }
          },
          {
            text: "Alter Event Trigger Function",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Alter Event Trigger Function",
                node.tree.tag.alter_eventtriggerfunction.replace("#function_name#", node.tag.id)
              );
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Event Trigger Function",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1(
                "Drop Event Trigger Function",
                node.tree.tag.drop_eventtriggerfunction.replace("#function_name#", node.tag.id)
              );
            }
          }
        ]
      },
      cm_direct_eventtriggerfunction: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Edit Event Trigger Function",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              v_connTabControl.tag.createQueryTab(node.text);
              getEventTriggerFunctionDefinitionPostgresql(node);
            }
          },
          {
            text: "Alter Event Trigger Function",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Alter Event Trigger Function",
                node.tree.tag.alter_eventtriggerfunction.replace("#function_name#", node.tag.id)
              );
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Event Trigger Function",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1(
                "Drop Event Trigger Function",
                node.tree.tag.drop_eventtriggerfunction.replace("#function_name#", node.tag.id)
              );
            }
          }
        ]
      },
      cm_aggregates: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) {
                refreshTreePostgresql(node);
              } else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Aggregate",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Create Aggregate", node.tree.tag.create_aggregate.replace("#schema_name#", node.tag.schema));
            }
          },
          {
            text: "Doc: Aggregates",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Aggregates",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/sql-createaggregate.html"
              );
            }
          }
        ]
      },
      cm_aggregate: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) {
                refreshTreePostgresql(node);
              } else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Alter Aggregate",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Alter Aggregate", node.tree.tag.alter_aggregate.replace("#aggregate_name#", node.tag.id));
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Aggregate",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1("Drop Aggregate", node.tree.tag.drop_aggregate.replace("#aggregate_name#", node.tag.id));
            }
          }
        ]
      },
      cm_sequences: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Sequence",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Create Sequence", node.tree.tag.create_sequence.replace("#schema_name#", node.tag.schema));
            }
          },
          {
            text: "Doc: Sequences",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Sequences",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/sql-createsequence.html"
              );
            }
          }
        ]
      },
      cm_sequence: {
        elements: [
          {
            text: "Alter Sequence",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Alter Sequence",
                node.tree.tag.alter_sequence.replace("#sequence_name#", node.tag.schema + "." + node.text)
              );
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Sequence",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1(
                "Drop Sequence",
                node.tree.tag.drop_sequence.replace("#sequence_name#", node.parent.parent.text + "." + node.text)
              );
            }
          }
        ]
      },
      cm_views: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create View",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Create View", node.tree.tag.create_view.replace("#schema_name#", node.tag.schema));
            }
          },
          {
            text: "Doc: Views",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Views",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/sql-createview.html"
              );
            }
          }
        ]
      },
      cm_view: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Query Data",
            icon: "fas cm-all fa-search",
            action: function(node) {
              TemplateSelectPostgresql(node.parent.parent.text, node.text, "v");
            }
          },
          {
            text: "Edit View",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              v_connTabControl.tag.createQueryTab(node.text);
              getViewDefinitionPostgresql(node);
            }
          },
          {
            text: "Alter View",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Alter View",
                node.tree.tag.alter_view.replace(/#view_name#/g, node.tag.schema + "." + node.text)
              );
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop View",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1(
                "Drop View",
                node.tree.tag.drop_view.replace("#view_name#", node.tag.schema + "." + node.text)
              );
            }
          }
        ]
      },
      cm_mviews: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Mat. View",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Create Materialized View",
                node.tree.tag.create_mview.replace("#schema_name#", node.tag.schema)
              );
            }
          },
          {
            text: "Doc: Mat. Views",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Materialized Views",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/sql-creatematerializedview.html"
              );
            }
          }
        ]
      },
      cm_mview: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Query Data",
            icon: "fas cm-all fa-search",
            action: function(node) {
              TemplateSelectPostgresql(node.tag.schema, node.text, "m");
            }
          },
          {
            text: "Edit Mat. View",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              v_connTabControl.tag.createQueryTab(node.text);
              getMaterializedViewDefinitionPostgresql(node);
            }
          },
          {
            text: "Alter Mat. View",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Alter Materialized View",
                node.tree.tag.alter_mview.replace("#view_name#", node.tag.schema + "." + node.text)
              );
            }
          },
          {
            text: "Refresh Mat. View",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Refresh Materialized View",
                node.tree.tag.refresh_mview.replace("#view_name#", node.tag.schema + "." + node.text)
              );
            }
          },
          {
            text: "Analyze Mat. View",
            icon: "fas cm-all fa-search-plus",
            action: function(node) {
              tabSQLTemplate$1(
                "Analyze Mat. View",
                node.tree.tag.analyze_table.replace("#table_name#", node.tag.schema + "." + node.text)
              );
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Mat. View",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1(
                "Drop Materialized View",
                node.tree.tag.drop_mview.replace("#view_name#", node.tag.schema + "." + node.text)
              );
            }
          }
        ]
      },
      cm_physicalreplicationslots: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Slot",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Create Physical Replication Slot", node.tree.tag.create_physicalreplicationslot);
            }
          },
          {
            text: "Doc: Replication Slots",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Physical Replication Slots",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/warm-standby.html#streaming-replication-slots"
              );
            }
          }
        ]
      },
      cm_physicalreplicationslot: {
        elements: [
          {
            text: "Drop Slot",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1(
                "Drop Physical Replication Slot",
                node.tree.tag.drop_physicalreplicationslot.replace("#slot_name#", node.text)
              );
            }
          }
        ]
      },
      cm_logicalreplicationslots: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Slot",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Create Logical Replication Slot", node.tree.tag.create_logicalreplicationslot);
            }
          },
          {
            text: "Doc: Replication Slots",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Logical Replication Slots",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/logicaldecoding-explanation.html#logicaldecoding-replication-slots"
              );
            }
          }
        ]
      },
      cm_logicalreplicationslot: {
        elements: [
          {
            text: "Drop Slot",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1(
                "Drop Logical Replication Slot",
                node.tree.tag.drop_logicalreplicationslot.replace("#slot_name#", node.text)
              );
            }
          }
        ]
      },
      cm_publications: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Publication",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Create Publication", node.tree.tag.create_publication);
            }
          },
          {
            text: "Doc: Publications",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Publications",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/logical-replication-publication.html"
              );
            }
          }
        ]
      },
      cm_publication: {
        elements: [
          {
            text: "Alter Publication",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Alter Publication", node.tree.tag.alter_publication.replace("#pub_name#", node.text));
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Publication",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1("Drop Publication", node.tree.tag.drop_publication.replace("#pub_name#", node.text));
            }
          }
        ]
      },
      cm_pubtables: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Add Table",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Add Table", node.tree.tag.add_pubtable.replace("#pub_name#", node.parent.text));
            }
          }
        ]
      },
      cm_pubtable: {
        elements: [
          {
            text: "Drop Table",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1(
                "Drop Table",
                node.tree.tag.drop_pubtable.replace("#pub_name#", node.parent.parent.text).replace("#table_name#", node.text)
              );
            }
          }
        ]
      },
      cm_subscriptions: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Subscription",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Create Subscription", node.tree.tag.create_subscription);
            }
          },
          {
            text: "Doc: Subscriptions",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Subscriptions",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/logical-replication-subscription.html"
              );
            }
          }
        ]
      },
      cm_subscription: {
        elements: [
          {
            text: "Alter Subscription",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Alter Subscription", node.tree.tag.alter_subscription.replace("#sub_name#", node.text));
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Subscription",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1("Drop Subscription", node.tree.tag.drop_subscription.replace("#sub_name#", node.text));
            }
          }
        ]
      },
      cm_fdws: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Foreign Data Wrapper",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Create Foreign Data Wrapper", node.tree.tag.create_fdw);
            }
          },
          {
            text: "Doc: Foreign Data Wrappers",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Foreign Data Wrappers",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/postgres-fdw.html"
              );
            }
          }
        ]
      },
      cm_fdw: {
        elements: [
          {
            text: "Alter Foreign Data Wrapper",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Alter Foreign Data Wrapper", node.tree.tag.alter_fdw.replace("#fdwname#", node.text));
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Foreign Data Wrapper",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1("Drop Foreign Data Wrapper", node.tree.tag.drop_fdw.replace("#fdwname#", node.text));
            }
          }
        ]
      },
      cm_foreign_servers: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Foreign Server",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Create Foreign Server",
                node.tree.tag.create_foreign_server.replace("#fdwname#", node.parent.text)
              );
            }
          }
        ]
      },
      cm_foreign_server: {
        elements: [
          {
            text: "Alter Foreign Server",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Alter Foreign Server", node.tree.tag.alter_foreign_server.replace("#srvname#", node.text));
            }
          },
          {
            text: "Import Foreign Schema",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Import Foreign Schema", node.tree.tag.import_foreign_schema.replace("#srvname#", node.text));
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Foreign Server",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1("Drop Foreign Server", node.tree.tag.drop_foreign_server.replace("#srvname#", node.text));
            }
          }
        ]
      },
      cm_user_mappings: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create User Mapping",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Create User Mapping",
                node.tree.tag.create_user_mapping.replace("#srvname#", node.parent.text)
              );
            }
          }
        ]
      },
      cm_user_mapping: {
        elements: [
          {
            text: "Alter User Mapping",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Alter User Mapping",
                node.tree.tag.alter_user_mapping.replace("#user_name#", node.text).replace("#srvname#", node.parent.parent.text)
              );
            }
          },
          {
            text: "Drop User Mapping",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1(
                "Drop User Mapping",
                node.tree.tag.drop_user_mapping.replace("#user_name#", node.text).replace("#srvname#", node.parent.parent.text)
              );
            }
          }
        ]
      },
      cm_foreign_tables: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Foreign Table",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Create Foreign Table",
                node.tree.tag.create_foreign_table.replace("#schema_name#", node.tag.schema)
              );
            }
          }
        ]
      },
      cm_foreign_table: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Data Actions",
            icon: "fas cm-all fa-list",
            submenu: {
              elements: [
                {
                  text: "Query Data",
                  icon: "fas cm-all fa-search",
                  action: function(node) {
                    TemplateSelectPostgresql(node.tag.schema, node.text, "f");
                  }
                },
                {
                  text: "Edit Data",
                  icon: "fas cm-all fa-table",
                  action: function(node) {
                    v_startEditData(node.text, node.tag.schema);
                  }
                },
                {
                  text: "Insert Record",
                  icon: "fas cm-all fa-edit",
                  action: function(node) {
                    TemplateInsertPostgresql(node.tag.schema, node.text);
                  }
                },
                {
                  text: "Update Records",
                  icon: "fas cm-all fa-edit",
                  action: function(node) {
                    TemplateUpdatePostgresql(node.tag.schema, node.text);
                  }
                },
                {
                  text: "Delete Records",
                  icon: "fas cm-all fa-times",
                  action: function(node) {
                    tabSQLTemplate$1(
                      "Delete Records",
                      node.tree.tag.delete.replace("#table_name#", node.tag.schema + "." + node.text)
                    );
                  }
                }
              ]
            }
          },
          {
            text: "Table Actions",
            icon: "fas cm-all fa-list",
            submenu: {
              elements: [
                {
                  text: "Analyze Foreign Table",
                  icon: "fas cm-all fa-table",
                  action: function(node) {
                    tabSQLTemplate$1(
                      "Analyze Foreign Table",
                      node.tree.tag.analyze_table.replace("#table_name#", node.tag.schema + "." + node.text)
                    );
                  }
                },
                {
                  text: "Alter Foreign Table",
                  icon: "fas cm-all fa-edit",
                  action: function(node) {
                    tabSQLTemplate$1(
                      "Alter Foreign Table",
                      node.tree.tag.alter_foreign_table.replace("#table_name#", node.tag.schema + "." + node.text)
                    );
                  }
                },
                {
                  text: "Edit Comment",
                  icon: "fas cm-all fa-edit",
                  action: function(node) {
                    getObjectDescriptionPostgresql(node);
                  }
                },
                {
                  text: "Drop Foreign Table",
                  icon: "fas cm-all fa-times",
                  action: function(node) {
                    tabSQLTemplate$1(
                      "Drop Foreign Table",
                      node.tree.tag.drop_foreign_table.replace("#table_name#", node.tag.schema + "." + node.text)
                    );
                  }
                }
              ]
            }
          }
        ]
      },
      cm_foreign_columns: {
        elements: [
          {
            text: "Create Foreign Column",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Create Foreign Column",
                node.tree.tag.create_foreign_column.replace("#table_name#", node.tag.schema + "." + node.parent.text)
              );
            }
          }
        ]
      },
      cm_foreign_column: {
        elements: [
          {
            text: "Alter Foreign Column",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Alter Foreign Column",
                node.tree.tag.alter_foreign_column.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text).replace(/#column_name#/g, node.text)
              );
            }
          },
          {
            text: "Drop Foreign Column",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1(
                "Drop Foreign Column",
                node.tree.tag.drop_foreign_column.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text).replace(/#column_name#/g, node.text)
              );
            }
          }
        ]
      },
      cm_types: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Type",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Create Type", node.tree.tag.create_type.replace("#schema_name#", node.tag.schema));
            }
          },
          {
            text: "Doc: Types",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Types",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/sql-createtype.html"
              );
            }
          }
        ]
      },
      cm_type: {
        elements: [
          {
            text: "Alter Type",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Alter Type",
                node.tree.tag.alter_type.replace("#type_name#", node.tag.schema + "." + node.text)
              );
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Type",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1(
                "Drop Type",
                node.tree.tag.drop_type.replace("#type_name#", node.tag.schema + "." + node.text)
              );
            }
          }
        ]
      },
      cm_domains: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Domain",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1("Create Domain", node.tree.tag.create_domain.replace("#schema_name#", node.tag.schema));
            }
          },
          {
            text: "Doc: Domains",
            icon: "fas cm-all fa-globe-americas",
            action: function(node) {
              v_connTabControl.tag.createWebsiteTab(
                "Documentation: Domains",
                "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/sql-createdomain.html"
              );
            }
          }
        ]
      },
      cm_domain: {
        elements: [
          {
            text: "Alter Domain",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate$1(
                "Alter Domain",
                node.tree.tag.alter_domain.replace("#domain_name#", node.tag.schema + "." + node.text)
              );
            }
          },
          {
            text: "Edit Comment",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              getObjectDescriptionPostgresql(node);
            }
          },
          {
            text: "Drop Domain",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate$1(
                "Drop Domain",
                node.tree.tag.drop_domain.replace("#domain_name#", node.tag.schema + "." + node.text)
              );
            }
          }
        ]
      },
      cm_partitioned_parent: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          }
        ]
      },
      cm_inherited_parent: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          }
        ]
      },
      cm_refresh: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreePostgresql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          }
        ]
      }
    };
    var tree = createTree(p_div, "#fcfdfd", context_menu);
    v_connTabControl.selectedTab.tag.tree = tree;
    let v_autocomplete_switch_status = v_connTabControl.selectedTab.tag.enable_autocomplete !== false ? " checked " : "";
    v_connTabControl.selectedTab.tag.divDetails.innerHTML = '<i class="fas fa-server me-1"></i>selected DB: <b>' + escapeHtml(v_connTabControl.selectedTab.tag.selectedDatabase) + '</b><div class="omnidb__switch omnidb__switch--sm float-end" data-bs-toggle="tooltip" data-bs-placement="bottom" data-bs-html="true" title="" data-bs-original-title="<h5>Toggle autocomplete.</h5><div>Switch OFF <b>disables the autocomplete</b> on the inner tabs for this connection.</div>"><input type="checkbox" ' + v_autocomplete_switch_status + ' id="autocomplete_toggler_' + v_connTabControl.selectedTab.tag.tab_id + `" class="omnidb__switch--input" onchange="toggleConnectionAutocomplete('autocomplete_toggler_` + v_connTabControl.selectedTab.tag.tab_id + `')"><label for="autocomplete_toggler_` + v_connTabControl.selectedTab.tag.tab_id + '" class="omnidb__switch--label"><span><i class="fas fa-spell-check"></i></span></label></div>';
    tree.nodeAfterOpenEvent = function(node) {
      refreshTreePostgresql(node);
      try {
        let v_first_child_toggle = node.elementUl.childNodes[0].childNodes[0].childNodes[0].childNodes[0];
        let pos_x = v_first_child_toggle.offsetLeft - 24;
        let pos_y = v_first_child_toggle.offsetTop - 64;
        v_connTabControl.selectedTab.tag.divTree.scroll(pos_x, pos_y);
      } catch (e) {
      }
    };
    tree.clickNodeEvent = function(node) {
      if (v_connTabControl.selectedTab.tag.treeTabsVisible) {
        getPropertiesPostgresql(node);
      }
    };
    tree.beforeContextMenuEvent = function(node, callback) {
      var v_elements = [];
      if (v_connTabControl.tag.hooks.postgresqlTreeContextMenu.length > 0) {
        for (var i2 = 0; i2 < v_connTabControl.tag.hooks.postgresqlTreeContextMenu.length; i2++)
          v_elements = v_elements.concat(v_connTabControl.tag.hooks.postgresqlTreeContextMenu[i2](node));
      }
      var v_customCallback = function() {
        callback(v_elements);
      };
      checkCurrentDatabase(node, false, v_customCallback);
    };
    var node_server = tree.createNode(
      "PostgreSQL",
      false,
      "node-postgresql",
      null,
      {
        type: "server"
      },
      "cm_server"
    );
    node_server.createChildNode("", true, "node-spin", null, null);
    tree.drawTree();
  }
  function checkCurrentDatabase(p_node, p_complete_check, p_callback_continue, p_callback_stop) {
    if (p_node.tag != null && p_node.tag.database != null && p_node.tag.database != v_connTabControl.selectedTab.tag.selectedDatabase && (p_complete_check || !p_complete_check && p_node.tag.type != "database")) {
      var v_choice_made = false;
      showConfirm3(
        "",
        function() {
          v_choice_made = true;
          checkBeforeChangeDatabase(
            function() {
              if (p_callback_stop) p_callback_stop();
            },
            function() {
              execAjax(
                "/change_active_database/",
                JSON.stringify({
                  p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
                  p_tab_id: v_connTabControl.selectedTab.id,
                  p_database: p_node.tag.database
                }),
                function(p_return) {
                  (function() {
                    var v_det = v_connTabControl.selectedTab.tag.divDetails;
                    v_det.innerHTML = "Active database: <b></b>";
                    v_det.querySelector("b").textContent = p_node.tag.database;
                  })();
                  if (v_connTabControl.selectedTab.tag.selectedDatabaseNode) {
                    v_connTabControl.selectedTab.tag.selectedDatabaseNode.clearNodeBold();
                  }
                  var v_list_database_nodes = p_node.tree.childNodes[0].childNodes[0].childNodes;
                  for (var i2 = 0; i2 < v_list_database_nodes.length; i2++) {
                    if (p_node.tag.database == v_list_database_nodes[i2].text.replace(/"/g, "")) {
                      v_list_database_nodes[i2].setNodeBold();
                      v_connTabControl.selectedTab.tag.selectedDatabase = p_node.tag.database;
                      v_connTabControl.selectedTab.tag.selectedDatabaseNode = v_list_database_nodes[i2];
                      (function() {
                        var v_tag = v_connTabControl.selectedTab.tag;
                        var v_img = document.createElement("img");
                        v_img.src = v_url_folder + "/static/OmniDB_app/images/" + v_tag.selectedDBMS + "_medium.png";
                        v_tag.tabTitle.empty();
                        v_tag.tabTitle.append(v_img);
                        var v_text = v_tag.selectedTitle ? " " + v_tag.selectedTitle + " - " + v_tag.selectedDatabase : " " + v_tag.selectedDatabase;
                        v_tag.tabTitle.append(document.createTextNode(v_text));
                      })();
                    }
                  }
                  if (p_callback_continue) p_callback_continue();
                },
                function(p_return) {
                  nodeOpenErrorPostgresql(p_return, p_node);
                },
                "box"
              );
            }
          );
        },
        function() {
          v_choice_made = true;
          if (p_callback_stop) p_callback_stop();
        }
      );
      $("#modal_message").one("hidden.bs.modal", function() {
        if (!v_choice_made && p_callback_stop) p_callback_stop();
      });
      var v_content_div = document.getElementById("modal_message_content");
      v_content_div.appendChild(document.createTextNode("This node belongs to another database, change active database to "));
      var v_bold = document.createElement("b");
      v_bold.textContent = p_node.tag.database;
      v_content_div.appendChild(v_bold);
      v_content_div.appendChild(document.createTextNode("?"));
    } else p_callback_continue();
  }
  function getObjectDescriptionPostgresql(p_node) {
    var v_oid = null;
    var v_type = p_node.tag.type;
    var v_position = null;
    if (v_type == "table_field") {
      v_oid = p_node.parent.parent.tag.oid;
      v_position = p_node.tag.position;
    } else if ([
      "function",
      "triggerfunction",
      "direct_triggerfunction",
      "eventtriggerfunction",
      "direct_eventtriggerfunction",
      "procedure"
    ].indexOf(v_type) != -1) {
      v_oid = p_node.tag.function_oid;
      v_position = 0;
    } else {
      v_oid = p_node.tag.oid;
      v_position = 0;
    }
    execAjax(
      "/get_object_description_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_oid: v_oid,
        p_type: v_type,
        p_position: v_position
      }),
      function(p_return) {
        v_connTabControl.tag.createQueryTab(p_node.text + " Comment");
        var v_editor = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor;
        v_editor.setValue(p_return.v_data);
        v_editor.clearSelection();
        v_editor.gotoLine(0, 0, true);
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result.innerHTML = "";
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, p_node);
      },
      "box",
      true
    );
  }
  function refreshTreePostgresql(p_node) {
    checkCurrentDatabase(
      p_node,
      true,
      function() {
        refreshTreePostgresqlConfirm(p_node);
      },
      function() {
        p_node.collapseNode();
      }
    );
  }
  function getPropertiesPostgresql(p_node) {
    checkCurrentDatabase(p_node, false, function() {
      getPropertiesPostgresqlConfirm(p_node);
    });
  }
  function getPropertiesPostgresqlConfirm(node) {
    if (node.tag != void 0) {
      if (node.tag.type == "role") {
        getProperties("/get_properties_postgresql/", {
          p_schema: null,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "tablespace") {
        getProperties("/get_properties_postgresql/", {
          p_schema: null,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "database") {
        getProperties("/get_properties_postgresql/", {
          p_schema: null,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "extension") {
        getProperties("/get_properties_postgresql/", {
          p_schema: null,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "schema") {
        getProperties("/get_properties_postgresql/", {
          p_schema: null,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "table") {
        getProperties("/get_properties_postgresql/", {
          p_schema: node.tag.schema,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "table_field") {
        getProperties("/get_properties_postgresql/", {
          p_schema: node.tag.schema,
          p_table: node.parent.parent.text,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "sequence") {
        getProperties("/get_properties_postgresql/", {
          p_schema: node.tag.schema,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "view") {
        getProperties("/get_properties_postgresql/", {
          p_schema: node.tag.schema,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "mview") {
        getProperties("/get_properties_postgresql/", {
          p_schema: node.tag.schema,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "function") {
        getProperties("/get_properties_postgresql/", {
          p_schema: node.tag.schema,
          p_table: null,
          p_object: node.tag.id,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "procedure") {
        getProperties("/get_properties_postgresql/", {
          p_schema: node.tag.schema,
          p_table: null,
          p_object: node.tag.id,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "trigger") {
        getProperties("/get_properties_postgresql/", {
          p_schema: node.tag.schema,
          p_table: node.parent.parent.text,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "eventtrigger") {
        getProperties("/get_properties_postgresql/", {
          p_schema: null,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "triggerfunction") {
        getProperties("/get_properties_postgresql/", {
          p_schema: node.tag.schema,
          p_table: null,
          p_object: node.tag.id,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "direct_triggerfunction") {
        getProperties("/get_properties_postgresql/", {
          p_schema: node.tag.schema,
          p_table: null,
          p_object: node.tag.id,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "eventtriggerfunction") {
        getProperties("/get_properties_postgresql/", {
          p_schema: node.tag.schema,
          p_table: null,
          p_object: node.tag.id,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "direct_eventtriggerfunction") {
        getProperties("/get_properties_postgresql/", {
          p_schema: null,
          p_table: null,
          p_object: node.tag.id,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "index") {
        getProperties("/get_properties_postgresql/", {
          p_schema: node.tag.schema,
          p_table: node.parent.parent.text,
          p_object: node.text.replace(" (Non Unique)", "").replace(" (Unique)", ""),
          p_type: node.tag.type
        });
      } else if (node.tag.type == "pk") {
        getProperties("/get_properties_postgresql/", {
          p_schema: node.tag.schema,
          p_table: node.parent.parent.text,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "foreign_key") {
        getProperties("/get_properties_postgresql/", {
          p_schema: node.tag.schema,
          p_table: node.parent.parent.text,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "unique") {
        getProperties("/get_properties_postgresql/", {
          p_schema: node.tag.schema,
          p_table: node.parent.parent.text,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "check") {
        getProperties("/get_properties_postgresql/", {
          p_schema: node.tag.schema,
          p_table: node.parent.parent.text,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "exclude") {
        getProperties("/get_properties_postgresql/", {
          p_schema: node.tag.schema,
          p_table: node.parent.parent.text,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "rule") {
        getProperties("/get_properties_postgresql/", {
          p_schema: node.tag.schema,
          p_table: node.parent.parent.text,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "foreign_table") {
        getProperties("/get_properties_postgresql/", {
          p_schema: node.tag.schema,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "user_mapping") {
        getProperties("/get_properties_postgresql/", {
          p_schema: node.tag.foreign_server,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "foreign_server") {
        getProperties("/get_properties_postgresql/", {
          p_schema: null,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "fdw") {
        getProperties("/get_properties_postgresql/", {
          p_schema: null,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "type") {
        getProperties("/get_properties_postgresql/", {
          p_schema: node.tag.schema,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "domain") {
        getProperties("/get_properties_postgresql/", {
          p_schema: node.tag.schema,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "publication") {
        getProperties("/get_properties_postgresql/", {
          p_schema: null,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "subscription") {
        getProperties("/get_properties_postgresql/", {
          p_schema: null,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "statistic") {
        getProperties("/get_properties_postgresql/", {
          p_schema: node.tag.schema,
          p_table: null,
          p_object: node.tag.statistics,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "aggregate") {
        getProperties("/get_properties_postgresql/", {
          p_schema: node.tag.schema,
          p_table: null,
          p_object: node.tag.id,
          p_type: node.tag.type
        });
      } else {
        clearProperties();
      }
    }
    if (v_connTabControl.tag.hooks.postgresqlTreeNodeClick.length > 0) {
      for (var i2 = 0; i2 < v_connTabControl.tag.hooks.postgresqlTreeNodeClick.length; i2++)
        v_connTabControl.tag.hooks.postgresqlTreeNodeClick[i2](node);
    }
  }
  function refreshTreePostgresqlConfirm(node) {
    if (node.tag != void 0)
      if (node.tag.type == "schema_list") {
        getSchemasPostgresql(node);
      } else if (node.tag.type == "table_list") {
        getTablesPostgresql(node);
      } else if (node.tag.type == "table") {
        getColumnsPostgresql(node);
      } else if (node.tag.type == "primary_key") {
        getPKPostgresql(node);
      } else if (node.tag.type == "pk") {
        getPKColumnsPostgresql(node);
      } else if (node.tag.type == "uniques") {
        getUniquesPostgresql(node);
      } else if (node.tag.type == "unique") {
        getUniquesColumnsPostgresql(node);
      } else if (node.tag.type == "foreign_keys") {
        getFKsPostgresql(node);
      } else if (node.tag.type == "foreign_key") {
        getFKsColumnsPostgresql(node);
      } else if (node.tag.type == "view_list") {
        getViewsPostgresql(node);
      } else if (node.tag.type == "view") {
        getViewsColumnsPostgresql(node);
      } else if (node.tag.type == "mview_list") {
        getMaterializedViewsPostgresql(node);
      } else if (node.tag.type == "mview") {
        getMaterializedViewsColumnsPostgresql(node);
      } else if (node.tag.type == "indexes") {
        getIndexesPostgresql(node);
      } else if (node.tag.type == "index") {
        getIndexesColumnsPostgresql(node);
      } else if (node.tag.type == "function_list") {
        getFunctionsPostgresql(node);
      } else if (node.tag.type == "function") {
        getFunctionFieldsPostgresql(node);
      } else if (node.tag.type == "procedure_list") {
        getProceduresPostgresql(node);
      } else if (node.tag.type == "procedure") {
        getProcedureFieldsPostgresql(node);
      } else if (node.tag.type == "sequence_list") {
        getSequencesPostgresql(node);
      } else if (node.tag.type == "database_list") {
        getDatabasesPostgresql(node);
      } else if (node.tag.type == "database") {
        getDatabaseObjectsPostgresql(node);
      } else if (node.tag.type == "tablespace_list") {
        getTablespacesPostgresql(node);
      } else if (node.tag.type == "role_list") {
        getRolesPostgresql(node);
      } else if (node.tag.type == "extension_list") {
        getExtensionsPostgresql(node);
      } else if (node.tag.type == "check_list") {
        getChecksPostgresql(node);
      } else if (node.tag.type == "exclude_list") {
        getExcludesPostgresql(node);
      } else if (node.tag.type == "rule_list") {
        getRulesPostgresql(node);
      } else if (node.tag.type == "trigger_list") {
        getTriggersPostgresql(node);
      } else if (node.tag.type == "eventtrigger_list") {
        getEventTriggersPostgresql(node);
      } else if (node.tag.type == "triggerfunction_list") {
        getTriggerFunctionsPostgresql(node);
      } else if (node.tag.type == "eventtriggerfunction_list") {
        getEventTriggerFunctionsPostgresql(node);
      } else if (node.tag.type == "inherited_list") {
        getInheritedsPostgresql(node);
      } else if (node.tag.type == "partition_list") {
        getPartitionsPostgresql(node);
      } else if (node.tag.type == "server") {
        getTreeDetailsPostgresql(node);
      } else if (node.tag.type == "physicalreplicationslot_list") {
        getPhysicalReplicationSlotsPostgresql(node);
      } else if (node.tag.type == "logicalreplicationslot_list") {
        getLogicalReplicationSlotsPostgresql(node);
      } else if (node.tag.type == "publication_list") {
        getPublicationsPostgresql(node);
      } else if (node.tag.type == "subscription_list") {
        getSubscriptionsPostgresql(node);
      } else if (node.tag.type == "publication_table_list") {
        getPublicationTablesPostgresql(node);
      } else if (node.tag.type == "subscription_table_list") {
        getSubscriptionTablesPostgresql(node);
      } else if (node.tag.type == "fdw_list") {
        getForeignDataWrappersPostgresql(node);
      } else if (node.tag.type == "foreign_server_list") {
        getForeignServersPostgresql(node);
      } else if (node.tag.type == "user_mapping_list") {
        getUserMappingsPostgresql(node);
      } else if (node.tag.type == "foreign_table_list") {
        getForeignTablesPostgresql(node);
      } else if (node.tag.type == "foreign_table") {
        getForeignColumnsPostgresql(node);
      } else if (node.tag.type == "type_list") {
        getTypesPostgresql(node);
      } else if (node.tag.type == "domain_list") {
        getDomainsPostgresql(node);
      } else if (node.tag.type == "partitioned_table_list") {
        getPartitionedParentsPostgresql(node);
      } else if (node.tag.type == "inherited_table_list") {
        getInheritedsParentsPostgresql(node);
      } else if (node.tag.type == "partitioned_parent") {
        getPartitionedChildrenPostgresql(node);
      } else if (node.tag.type == "inherited_parent") {
        getInheritedsChildrenPostgresql(node);
      } else if (node.tag.type == "statistics_list") {
        getStatisticsPostgresql(node);
      } else if (node.tag.type == "statistic") {
        getStatisticsColumnsPostgresql(node);
      } else if (node.tag.type == "aggregate_list") {
        getAggregatesPostgresql(node);
      } else if (node.tag.type == "aggregate") {
        getFunctionFieldsPostgresql(node);
      } else {
        afterNodeOpenedCallbackPostgreSQL(node);
      }
  }
  function afterNodeOpenedCallbackPostgreSQL(node) {
    if (v_connTabControl.tag.hooks.postgresqlTreeNodeOpen.length > 0) {
      for (var i2 = 0; i2 < v_connTabControl.tag.hooks.postgresqlTreeNodeOpen.length; i2++)
        v_connTabControl.tag.hooks.postgresqlTreeNodeOpen[i2](node);
    }
  }
  function getTreeDetailsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_tree_info_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id
      }),
      function(p_return) {
        v_connTabControl.selectedTab.tag.selectedDatabase = p_return.v_data.v_database_return.v_database;
        node.tree.contextMenu.cm_server.elements = [];
        node.tree.contextMenu.cm_server.elements.push({
          text: "Refresh",
          icon: "fas cm-all fa-sync-alt",
          action: function(node2) {
            if (node2.childNodes == 0) refreshTreePostgresql(node2);
            else {
              node2.collapseNode();
              node2.expandNode();
            }
          }
        });
        node.tree.contextMenu.cm_server.elements.push({
          text: "Monitoring",
          icon: "fas cm-all fa-chart-line",
          action: function(node2) {
          },
          submenu: {
            elements: [
              {
                text: "Dashboard",
                icon: "fas cm-all fa-chart-line",
                action: function(node2) {
                  v_connTabControl.tag.createMonitorDashboardTab();
                  startMonitorDashboard();
                }
              },
              {
                text: "Backends",
                icon: "fas cm-all fa-tasks",
                action: function(node2) {
                  v_connTabControl.tag.createMonitoringTab("Backends", "SELECT * FROM pg_stat_activity", [
                    {
                      icon: "fas cm-all fa-times",
                      title: "Terminate",
                      action: "postgresqlTerminateBackend"
                    }
                  ]);
                }
              }
            ]
          }
        });
        node.tree.contextMenu.cm_server.elements.push({
          text: "Doc: PostgreSQL",
          icon: "fas cm-all fa-globe-americas",
          action: function(node2) {
            v_connTabControl.tag.createWebsiteTab(
              "Documentation: PostgreSQL",
              "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node2.tree.tag.version) + "/static/"
            );
          }
        });
        node.tree.contextMenu.cm_server.elements.push({
          text: "Doc: SQL Language",
          icon: "fas cm-all fa-globe-americas",
          action: function(node2) {
            v_connTabControl.tag.createWebsiteTab(
              "Documentation: SQL Language",
              "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node2.tree.tag.version) + "/static/sql.html"
            );
          }
        });
        node.tree.contextMenu.cm_server.elements.push({
          text: "Doc: SQL Commands",
          icon: "fas cm-all fa-globe-americas",
          action: function(node2) {
            v_connTabControl.tag.createWebsiteTab(
              "Documentation: SQL Commands",
              "https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node2.tree.tag.version) + "/static/sql-commands.html"
            );
          }
        });
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.tree.tag = {
          version: p_return.v_data.v_database_return.version,
          //superuser: p_return.v_data.v_database_return.superuser,
          create_role: p_return.v_data.v_database_return.create_role,
          alter_role: p_return.v_data.v_database_return.alter_role,
          drop_role: p_return.v_data.v_database_return.drop_role,
          create_tablespace: p_return.v_data.v_database_return.create_tablespace,
          alter_tablespace: p_return.v_data.v_database_return.alter_tablespace,
          drop_tablespace: p_return.v_data.v_database_return.drop_tablespace,
          create_database: p_return.v_data.v_database_return.create_database,
          alter_database: p_return.v_data.v_database_return.alter_database,
          drop_database: p_return.v_data.v_database_return.drop_database,
          create_extension: p_return.v_data.v_database_return.create_extension,
          alter_extension: p_return.v_data.v_database_return.alter_extension,
          drop_extension: p_return.v_data.v_database_return.drop_extension,
          create_schema: p_return.v_data.v_database_return.create_schema,
          alter_schema: p_return.v_data.v_database_return.alter_schema,
          drop_schema: p_return.v_data.v_database_return.drop_schema,
          create_sequence: p_return.v_data.v_database_return.create_sequence,
          alter_sequence: p_return.v_data.v_database_return.alter_sequence,
          drop_sequence: p_return.v_data.v_database_return.drop_sequence,
          create_function: p_return.v_data.v_database_return.create_function,
          alter_function: p_return.v_data.v_database_return.alter_function,
          drop_function: p_return.v_data.v_database_return.drop_function,
          create_procedure: p_return.v_data.v_database_return.create_procedure,
          alter_procedure: p_return.v_data.v_database_return.alter_procedure,
          drop_procedure: p_return.v_data.v_database_return.drop_procedure,
          create_triggerfunction: p_return.v_data.v_database_return.create_triggerfunction,
          alter_triggerfunction: p_return.v_data.v_database_return.alter_triggerfunction,
          drop_triggerfunction: p_return.v_data.v_database_return.drop_triggerfunction,
          create_eventtriggerfunction: p_return.v_data.v_database_return.create_eventtriggerfunction,
          alter_eventtriggerfunction: p_return.v_data.v_database_return.drop_eventtriggerfunction,
          drop_eventtriggerfunction: p_return.v_data.v_database_return.drop_eventtriggerfunction,
          create_aggregate: p_return.v_data.v_database_return.create_aggregate,
          alter_aggregate: p_return.v_data.v_database_return.alter_aggregate,
          drop_aggregate: p_return.v_data.v_database_return.drop_aggregate,
          create_view: p_return.v_data.v_database_return.create_view,
          alter_view: p_return.v_data.v_database_return.alter_view,
          drop_view: p_return.v_data.v_database_return.drop_view,
          create_mview: p_return.v_data.v_database_return.create_mview,
          refresh_mview: p_return.v_data.v_database_return.refresh_mview,
          alter_mview: p_return.v_data.v_database_return.alter_mview,
          drop_mview: p_return.v_data.v_database_return.drop_mview,
          create_table: p_return.v_data.v_database_return.create_table,
          alter_table: p_return.v_data.v_database_return.alter_table,
          drop_table: p_return.v_data.v_database_return.drop_table,
          create_column: p_return.v_data.v_database_return.create_column,
          alter_column: p_return.v_data.v_database_return.alter_column,
          drop_column: p_return.v_data.v_database_return.drop_column,
          create_primarykey: p_return.v_data.v_database_return.create_primarykey,
          drop_primarykey: p_return.v_data.v_database_return.drop_primarykey,
          create_unique: p_return.v_data.v_database_return.create_unique,
          drop_unique: p_return.v_data.v_database_return.drop_unique,
          create_foreignkey: p_return.v_data.v_database_return.create_foreignkey,
          drop_foreignkey: p_return.v_data.v_database_return.drop_foreignkey,
          create_index: p_return.v_data.v_database_return.create_index,
          alter_index: p_return.v_data.v_database_return.alter_index,
          reindex: p_return.v_data.v_database_return.reindex,
          drop_index: p_return.v_data.v_database_return.drop_index,
          create_check: p_return.v_data.v_database_return.create_check,
          drop_check: p_return.v_data.v_database_return.drop_check,
          create_exclude: p_return.v_data.v_database_return.create_exclude,
          drop_exclude: p_return.v_data.v_database_return.drop_exclude,
          create_rule: p_return.v_data.v_database_return.create_rule,
          alter_rule: p_return.v_data.v_database_return.alter_rule,
          drop_rule: p_return.v_data.v_database_return.drop_rule,
          create_trigger: p_return.v_data.v_database_return.create_trigger,
          create_view_trigger: p_return.v_data.v_database_return.create_view_trigger,
          alter_trigger: p_return.v_data.v_database_return.alter_trigger,
          enable_trigger: p_return.v_data.v_database_return.enable_trigger,
          disable_trigger: p_return.v_data.v_database_return.disable_trigger,
          drop_trigger: p_return.v_data.v_database_return.drop_trigger,
          create_eventtrigger: p_return.v_data.v_database_return.create_eventtrigger,
          alter_eventtrigger: p_return.v_data.v_database_return.alter_eventtrigger,
          enable_eventtrigger: p_return.v_data.v_database_return.enable_eventtrigger,
          disable_eventtrigger: p_return.v_data.v_database_return.disable_eventtrigger,
          drop_eventtrigger: p_return.v_data.v_database_return.drop_eventtrigger,
          create_inherited: p_return.v_data.v_database_return.create_inherited,
          noinherit_partition: p_return.v_data.v_database_return.noinherit_partition,
          create_partition: p_return.v_data.v_database_return.create_partition,
          detach_partition: p_return.v_data.v_database_return.detach_partition,
          drop_partition: p_return.v_data.v_database_return.drop_partition,
          vacuum: p_return.v_data.v_database_return.vacuum,
          vacuum_table: p_return.v_data.v_database_return.vacuum_table,
          analyze: p_return.v_data.v_database_return.analyze,
          analyze_table: p_return.v_data.v_database_return.analyze_table,
          delete: p_return.v_data.v_database_return.delete,
          truncate: p_return.v_data.v_database_return.truncate,
          create_physicalreplicationslot: p_return.v_data.v_database_return.create_physicalreplicationslot,
          drop_physicalreplicationslot: p_return.v_data.v_database_return.drop_physicalreplicationslot,
          create_logicalreplicationslot: p_return.v_data.v_database_return.create_logicalreplicationslot,
          drop_logicalreplicationslot: p_return.v_data.v_database_return.drop_logicalreplicationslot,
          create_publication: p_return.v_data.v_database_return.create_publication,
          alter_publication: p_return.v_data.v_database_return.alter_publication,
          drop_publication: p_return.v_data.v_database_return.drop_publication,
          add_pubtable: p_return.v_data.v_database_return.add_pubtable,
          drop_pubtable: p_return.v_data.v_database_return.drop_pubtable,
          create_subscription: p_return.v_data.v_database_return.create_subscription,
          alter_subscription: p_return.v_data.v_database_return.alter_subscription,
          drop_subscription: p_return.v_data.v_database_return.drop_subscription,
          create_fdw: p_return.v_data.v_database_return.create_fdw,
          alter_fdw: p_return.v_data.v_database_return.alter_fdw,
          drop_fdw: p_return.v_data.v_database_return.drop_fdw,
          create_foreign_server: p_return.v_data.v_database_return.create_foreign_server,
          alter_foreign_server: p_return.v_data.v_database_return.alter_foreign_server,
          import_foreign_schema: p_return.v_data.v_database_return.import_foreign_schema,
          drop_foreign_server: p_return.v_data.v_database_return.drop_foreign_server,
          create_foreign_table: p_return.v_data.v_database_return.create_foreign_table,
          alter_foreign_table: p_return.v_data.v_database_return.alter_foreign_table,
          drop_foreign_table: p_return.v_data.v_database_return.drop_foreign_table,
          create_foreign_column: p_return.v_data.v_database_return.create_foreign_column,
          alter_foreign_column: p_return.v_data.v_database_return.alter_foreign_column,
          drop_foreign_column: p_return.v_data.v_database_return.drop_foreign_column,
          create_user_mapping: p_return.v_data.v_database_return.create_user_mapping,
          alter_user_mapping: p_return.v_data.v_database_return.alter_user_mapping,
          drop_user_mapping: p_return.v_data.v_database_return.drop_user_mapping,
          create_type: p_return.v_data.v_database_return.create_type,
          alter_type: p_return.v_data.v_database_return.alter_type,
          drop_type: p_return.v_data.v_database_return.drop_type,
          create_domain: p_return.v_data.v_database_return.create_domain,
          alter_domain: p_return.v_data.v_database_return.alter_domain,
          drop_domain: p_return.v_data.v_database_return.drop_domain,
          create_statistics: p_return.v_data.v_database_return.create_statistics,
          alter_statistics: p_return.v_data.v_database_return.alter_statistics,
          drop_statistics: p_return.v_data.v_database_return.drop_statistics
        };
        node.setText(p_return.v_data.v_database_return.version);
        var node_databases = node.createChildNode(
          "Databases",
          false,
          "fas node-all fa-database node-database-list",
          {
            type: "database_list",
            num_databases: 0
          },
          "cm_databases"
        );
        node_databases.createChildNode("", true, "node-spin", null, null);
        var node_tablespaces = node.createChildNode(
          "Tablespaces",
          false,
          "fas node-all fa-folder-open node-tablespace-list",
          {
            type: "tablespace_list",
            num_tablespaces: 0
          },
          "cm_tablespaces"
        );
        node_tablespaces.createChildNode("", true, "node-spin", null, null);
        var node_roles = node.createChildNode(
          "Roles",
          false,
          "fas node-all fa-users node-user-list",
          {
            type: "role_list",
            num_roles: 0
          },
          "cm_roles"
        );
        node_roles.createChildNode("", true, "node-spin", null, null);
        if (parseFloat(getMajorVersionPostgresql(node.tree.tag.version)) >= 9.4) {
          var node_replication = node.createChildNode(
            "Replication Slots",
            false,
            "fas node-all fa-sitemap node-repslot-list",
            {
              type: "replication"
            },
            null
          );
          var node_phyrepslots = node_replication.createChildNode(
            "Physical Replication Slots",
            false,
            "fas node-all fa-sitemap node-repslot-list",
            {
              type: "physicalreplicationslot_list",
              num_repslots: 0
            },
            "cm_physicalreplicationslots"
          );
          node_phyrepslots.createChildNode("", true, "node-spin", null, null);
          var node_logrepslots = node_replication.createChildNode(
            "Logical Replication Slots",
            false,
            "fas node-all fa-sitemap node-repslot-list",
            {
              type: "logicalreplicationslot_list",
              num_repslots: 0
            },
            "cm_logicalreplicationslots"
          );
          node_logrepslots.createChildNode("", true, "node-spin", null, null);
        }
        if (v_connTabControl.selectedTab.tag.firstTimeOpen) {
          v_connTabControl.selectedTab.tag.firstTimeOpen = false;
        }
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getDatabaseObjectsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_database_objects_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.tag.database_data = p_return.v_data;
        var node_schemas = node.createChildNode(
          "Schemas",
          false,
          "fas node-all fa-layer-group node-schema-list",
          {
            type: "schema_list",
            num_schemas: 0,
            database: v_connTabControl.selectedTab.tag.selectedDatabase
          },
          "cm_schemas"
        );
        node_schemas.createChildNode("", true, "node-spin", null, null);
        var node_extensions = node.createChildNode(
          "Extensions",
          false,
          "fas node-all fa-cubes node-extension-list",
          {
            type: "extension_list",
            num_extensions: 0,
            database: v_connTabControl.selectedTab.tag.selectedDatabase
          },
          "cm_extensions"
        );
        node_extensions.createChildNode("", true, "node-spin", null, null);
        var node_fdws = node.createChildNode(
          "Foreign Data Wrappers",
          false,
          "fas node-all fa-cube node-fdw-list",
          {
            type: "fdw_list",
            num_fdws: 0,
            database: v_connTabControl.selectedTab.tag.selectedDatabase
          },
          "cm_fdws"
        );
        node_fdws.createChildNode("", true, "node-spin", null, null);
        var node_eventtriggers = node.createChildNode(
          "Event Triggers",
          false,
          "fas node-all fa-bolt node-eventtrigger",
          {
            type: "eventtrigger_list",
            num_eventtriggers: 0,
            database: v_connTabControl.selectedTab.tag.selectedDatabase
          },
          "cm_eventtriggers"
        );
        node_eventtriggers.createChildNode("", true, "node-spin", null, null);
        if (parseInt(getMajorVersionPostgresql(node.tree.tag.version)) >= 10) {
          var node_replication = node.createChildNode(
            "Logical Replication",
            false,
            "fas node-all fa-sitemap node-logrep",
            {
              type: "replication",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null
          );
          var node_publications = node_replication.createChildNode(
            "Publications",
            false,
            "fas node-all fa-arrow-alt-circle-down node-publication-list",
            {
              type: "publication_list",
              num_pubs: 0,
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_publications"
          );
          node_publications.createChildNode("", true, "node-spin", null, null);
          var node_subscriptions = node_replication.createChildNode(
            "Subscriptions",
            false,
            "fas node-all fa-arrow-alt-circle-up node-subscription-list",
            {
              type: "subscription_list",
              num_subs: 0,
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_subscriptions"
          );
          node_subscriptions.createChildNode("", true, "node-spin", null, null);
        }
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getDatabasesPostgresql(node) {
    execAjax(
      "/get_databases_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Databases (" + p_return.v_data.length + ")");
        node.tag.num_databases = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-database node-database",
            {
              type: "database",
              database: p_return.v_data[i].v_name.replace(/"/g, ""),
              oid: p_return.v_data[i].v_oid
            },
            "cm_database",
            null,
            false
          );
          if (v_connTabControl.selectedTab.tag.selectedDatabase == p_return.v_data[i].v_name.replace(/"/g, "")) {
            v_node.setNodeBold();
            v_connTabControl.selectedTab.tag.selectedDatabaseNode = v_node;
          }
          v_node.createChildNode("", true, "node-spin", null, null, null, false);
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getTablespacesPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_tablespaces_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Tablespaces (" + p_return.v_data.length + ")");
        node.tag.num_tablespaces = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-folder node-tablespace",
            {
              type: "tablespace",
              oid: p_return.v_data[i].v_oid
            },
            "cm_tablespace",
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getRolesPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_roles_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Roles (" + p_return.v_data.length + ")");
        node.tag.num_tablespaces = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          var v_role_icon = p_return.v_data[i].v_can_login ? "fas node-all fa-user node-user" : "fas node-all fa-user-friends node-user-group";
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            v_role_icon,
            {
              type: "role",
              oid: p_return.v_data[i].v_oid,
              can_login: p_return.v_data[i].v_can_login
            },
            "cm_role",
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getExtensionsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_extensions_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Extensions (" + p_return.v_data.length + ")");
        node.tag.num_tablespaces = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-cubes node-extension",
            {
              type: "extension",
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              oid: p_return.v_data[i].v_oid
            },
            "cm_extension",
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getSchemasPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_schemas_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Schemas (" + p_return.v_data.length + ")");
        node.tag.num_schemas = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-layer-group node-schema",
            {
              type: "schema",
              num_tables: 0,
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: p_return.v_data[i].v_name,
              oid: p_return.v_data[i].v_oid
            },
            "cm_schema",
            null,
            false
          );
          var node_tables = v_node.createChildNode(
            "Tables",
            false,
            "fas node-all fa-th node-table-list",
            {
              type: "table_list",
              schema: p_return.v_data[i].v_name,
              num_tables: 0,
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: p_return.v_data[i].v_name
            },
            "cm_tables",
            null,
            false
          );
          node_tables.createChildNode("", true, "node-spin", null, null, null, false);
          if (parseInt(getMajorVersionPostgresql(node.tree.tag.version)) >= 10) {
            var node_ptables = v_node.createChildNode(
              "Partitioned Tables",
              false,
              "fas node-all fa-th node-ptable-list",
              {
                type: "partitioned_table_list",
                schema: p_return.v_data[i].v_name,
                num_tables: 0,
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                schema: p_return.v_data[i].v_name
              },
              "cm_partitioned_tables",
              null,
              false
            );
            node_ptables.createChildNode("", true, "node-spin", null, null, null, false);
          }
          var node_itables = v_node.createChildNode(
            "Inheritance Tables",
            false,
            "fas node-all fa-th node-itable-list",
            {
              type: "inherited_table_list",
              schema: p_return.v_data[i].v_name,
              num_tables: 0,
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: p_return.v_data[i].v_name
            },
            "cm_inherited_tables",
            null,
            false
          );
          node_itables.createChildNode("", true, "node-spin", null, null, null, false);
          var node_foreign_tables = v_node.createChildNode(
            "Foreign Tables",
            false,
            "fas node-all fa-th node-ftable-list",
            {
              type: "foreign_table_list",
              schema: p_return.v_data[i].v_name,
              num_tables: 0,
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: p_return.v_data[i].v_name
            },
            "cm_foreign_tables",
            null,
            false
          );
          node_foreign_tables.createChildNode("", true, "node-spin", null, null, null, false);
          var node_sequences = v_node.createChildNode(
            "Sequences",
            false,
            "fas node-all fa-sort-numeric-down node-sequence-list",
            {
              type: "sequence_list",
              schema: p_return.v_data[i].v_name,
              num_sequences: 0,
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: p_return.v_data[i].v_name
            },
            "cm_sequences",
            null,
            false
          );
          node_sequences.createChildNode("", true, "node-spin", null, null, null, false);
          var node_views = v_node.createChildNode(
            "Views",
            false,
            "fas node-all fa-eye node-view-list",
            {
              type: "view_list",
              schema: p_return.v_data[i].v_name,
              num_views: 0,
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: p_return.v_data[i].v_name
            },
            "cm_views",
            null,
            false
          );
          node_views.createChildNode("", true, "node-spin", null, null, null, false);
          if (parseFloat(getMajorVersionPostgresql(node.tree.tag.version)) >= 9.3) {
            var node_views = v_node.createChildNode(
              "Materialized Views",
              false,
              "fas node-all fa-eye node-mview-list",
              {
                type: "mview_list",
                schema: p_return.v_data[i].v_name,
                num_views: 0,
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                schema: p_return.v_data[i].v_name
              },
              "cm_mviews",
              null,
              false
            );
            node_views.createChildNode("", true, "node-spin", null, null, null, false);
          }
          var node_functions = v_node.createChildNode(
            "Functions",
            false,
            "fas node-all fa-cog node-function-list",
            {
              type: "function_list",
              schema: p_return.v_data[i].v_name,
              num_functions: 0,
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: p_return.v_data[i].v_name
            },
            "cm_functions",
            null,
            false
          );
          node_functions.createChildNode("", true, "node-spin", null, null, null, false);
          var node_triggerfunctions = v_node.createChildNode(
            "Trigger Functions",
            false,
            "fas node-all fa-cog node-tfunction-list",
            {
              type: "triggerfunction_list",
              schema: p_return.v_data[i].v_name,
              num_triggerfunctions: 0,
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: p_return.v_data[i].v_name
            },
            "cm_triggerfunctions",
            null,
            false
          );
          node_triggerfunctions.createChildNode("", true, "node-spin", null, null, null, false);
          var node_eventtriggerfunctions = v_node.createChildNode(
            "Event Trigger Functions",
            false,
            "fas node-all fa-cog node-etfunction-list",
            {
              type: "eventtriggerfunction_list",
              schema: p_return.v_data[i].v_name,
              num_triggerfunctions: 0,
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: p_return.v_data[i].v_name
            },
            "cm_eventtriggerfunctions",
            null,
            false
          );
          node_eventtriggerfunctions.createChildNode("", true, "node-spin", null, null, null, false);
          if (parseInt(getMajorVersionPostgresql(node.tree.tag.version)) >= 11) {
            var node_procedures = v_node.createChildNode(
              "Procedures",
              false,
              "fas node-all fa-cog node-procedure-list",
              {
                type: "procedure_list",
                schema: p_return.v_data[i].v_name,
                num_procedures: 0,
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                schema: p_return.v_data[i].v_name
              },
              "cm_procedures",
              null,
              false
            );
            node_procedures.createChildNode("", true, "node-spin", null, null, null, false);
          }
          var node_aggregates = v_node.createChildNode(
            "Aggregates",
            false,
            "fas node-all fa-cog node-aggregate-list",
            {
              type: "aggregate_list",
              schema: p_return.v_data[i].v_name,
              num_aggregates: 0,
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: p_return.v_data[i].v_name
            },
            "cm_aggregates",
            null,
            false
          );
          node_aggregates.createChildNode("", true, "node-spin", null, null, null, false);
          var node_types = v_node.createChildNode(
            "Types",
            false,
            "fas node-all fa-square node-type-list",
            {
              type: "type_list",
              schema: p_return.v_data[i].v_name,
              num_types: 0,
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: p_return.v_data[i].v_name
            },
            "cm_types",
            null,
            false
          );
          node_types.createChildNode("", true, "node-spin", null, null, null, false);
          var node_domains = v_node.createChildNode(
            "Domains",
            false,
            "fas node-all fa-square node-domain-list",
            {
              type: "domain_list",
              schema: p_return.v_data[i].v_name,
              num_domains: 0,
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: p_return.v_data[i].v_name
            },
            "cm_domains",
            null,
            false
          );
          node_domains.createChildNode("", true, "node-spin", null, null, null, false);
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getTablesPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_tables_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Tables (" + p_return.v_data.length + ")");
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-table node-table",
            {
              type: "table",
              has_primary_keys: p_return.v_data[i].v_has_primary_keys,
              has_foreign_keys: p_return.v_data[i].v_has_foreign_keys,
              has_uniques: p_return.v_data[i].v_has_uniques,
              has_indexes: p_return.v_data[i].v_has_indexes,
              has_checks: p_return.v_data[i].v_has_checks,
              has_excludes: p_return.v_data[i].v_has_excludes,
              has_rules: p_return.v_data[i].v_has_rules,
              has_triggers: p_return.v_data[i].v_has_triggers,
              has_partitions: p_return.v_data[i].v_has_partitions,
              has_statistics: p_return.v_data[i].v_has_statistics,
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema,
              oid: p_return.v_data[i].v_oid
            },
            "cm_table",
            null,
            false
          );
          v_node.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "table_field",
              schema: node.tag.schema
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getSequencesPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_sequences_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        node.setText("Sequences (" + p_return.v_data.length + ")");
        node.tag.num_tables = p_return.v_data.length;
        if (node.childNodes.length > 0) node.removeChildNodes();
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_sequence_name,
            false,
            "fas node-all fa-sort-numeric-down node-sequence",
            {
              type: "sequence",
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema,
              oid: p_return.v_data[i].v_oid
            },
            "cm_sequence",
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getViewsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_views_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Views (" + p_return.v_data.length + ")");
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-eye node-view",
            {
              type: "view",
              has_rules: p_return.v_data[i].v_has_rules,
              has_triggers: p_return.v_data[i].v_has_triggers,
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema,
              oid: p_return.v_data[i].v_oid
            },
            "cm_view",
            null,
            false
          );
          v_node.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "view_field",
              schema: node.tag.schema
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getViewsColumnsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_views_columns_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.text,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        v_list = node.createChildNode(
          "Columns (" + p_return.v_data.length + ")",
          false,
          "fas node-all fa-columns node-column",
          {
            database: v_connTabControl.selectedTab.tag.selectedDatabase,
            schema: node.tag.schema
          },
          null,
          null,
          false
        );
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = v_list.createChildNode(
            p_return.v_data[i].v_column_name,
            false,
            "fas node-all fa-columns node-column",
            {
              type: "table_field",
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema
            },
            null,
            null,
            false
          );
          v_node.createChildNode(
            "Type: " + p_return.v_data[i].v_data_type,
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            {
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema
            },
            null,
            null,
            false
          );
        }
        if (node.tag.has_rules) {
          v_node = node.createChildNode(
            "Rules",
            false,
            "fas node-all fa-lightbulb node-rule",
            {
              type: "rule_list",
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema
            },
            "cm_rules",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_triggers) {
          v_node = node.createChildNode(
            "Triggers",
            false,
            "fas node-all fa-bolt node-trigger",
            {
              type: "trigger_list",
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema
            },
            "cm_view_triggers",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getViewDefinitionPostgresql(node) {
    execAjax(
      "/get_view_definition_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_view: node.text,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data);
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
        renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);
        var v_div_result = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;
        if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht != null) {
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht.destroy();
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht = null;
        }
        v_div_result.innerHTML = "";
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      true
    );
  }
  function getMaterializedViewsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_mviews_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Materialized Views (" + p_return.v_data.length + ")");
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-eye node-mview",
            {
              type: "mview",
              has_indexes: p_return.v_data[i].v_has_indexes,
              has_statistics: p_return.v_data[i].v_has_statistics,
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema,
              oid: p_return.v_data[i].v_oid
            },
            "cm_mview",
            null,
            false
          );
          v_node.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "mview_field",
              schema: node.tag.schema
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getMaterializedViewsColumnsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_mviews_columns_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.text,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        v_list = node.createChildNode(
          "Columns (" + p_return.v_data.length + ")",
          false,
          "fas node-all fa-columns node-column",
          {
            database: v_connTabControl.selectedTab.tag.selectedDatabase,
            schema: node.tag.schema
          },
          null,
          null,
          false
        );
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = v_list.createChildNode(
            p_return.v_data[i].v_column_name,
            false,
            "fas node-all fa-columns node-column",
            {
              type: "table_field",
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema
            },
            null,
            null,
            false
          );
          v_node.createChildNode(
            "Type: " + p_return.v_data[i].v_data_type,
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            {
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema
            },
            null,
            null,
            false
          );
        }
        if (node.tag.has_indexes) {
          v_node = node.createChildNode(
            "Indexes",
            false,
            "fas node-all fa-thumbtack node-index",
            {
              type: "indexes",
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema
            },
            "cm_indexes",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_statistics) {
          if (parseInt(getMajorVersionPostgresql(node.tree.tag.version)) >= 10) {
            v_node = node.createChildNode(
              "Statistics",
              false,
              "fas node-all fa-chart-bar node-statistics",
              {
                type: "statistics_list",
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                schema: node.tag.schema
              },
              "cm_statistics",
              null,
              false
            );
            v_node.createChildNode("", false, "node-spin", null, null, null, false);
          }
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getMaterializedViewDefinitionPostgresql(node) {
    execAjax(
      "/get_mview_definition_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_view: node.text,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data);
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
        renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);
        var v_div_result = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;
        if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht != null) {
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht.destroy();
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht = null;
        }
        v_div_result.innerHTML = "";
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      true
    );
  }
  function getColumnsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_columns_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.text,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        v_list = node.createChildNode(
          "Columns (" + p_return.v_data.length + ")",
          false,
          "fas node-all fa-columns node-column",
          {
            type: "column_list",
            database: v_connTabControl.selectedTab.tag.selectedDatabase,
            schema: node.tag.schema
          },
          "cm_columns",
          null,
          false
        );
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = v_list.createChildNode(
            p_return.v_data[i].v_column_name,
            false,
            "fas node-all fa-columns node-column",
            {
              type: "table_field",
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema,
              position: p_return.v_data[i].v_position
            },
            "cm_column",
            null,
            false
          );
          v_node.createChildNode(
            "Type: " + p_return.v_data[i].v_data_type,
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            {
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema
            },
            null,
            null,
            false
          );
          v_node.createChildNode(
            "Nullable: " + p_return.v_data[i].v_nullable,
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            {
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema
            },
            null,
            null,
            false
          );
        }
        if (node.tag.has_primary_keys) {
          v_node = node.createChildNode(
            "Primary Key",
            false,
            "fas node-all fa-key node-pkey",
            {
              type: "primary_key",
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema
            },
            "cm_pks",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_foreign_keys) {
          v_node = node.createChildNode(
            "Foreign Keys",
            false,
            "fas node-all fa-key node-fkey",
            {
              type: "foreign_keys",
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema
            },
            "cm_fks",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_uniques) {
          v_node = node.createChildNode(
            "Uniques",
            false,
            "fas node-all fa-key node-unique",
            {
              type: "uniques",
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema
            },
            "cm_uniques",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_checks) {
          v_node = node.createChildNode(
            "Checks",
            false,
            "fas node-all fa-check-square node-check",
            {
              type: "check_list",
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema
            },
            "cm_checks",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_excludes) {
          v_node = node.createChildNode(
            "Excludes",
            false,
            "fas node-all fa-times-circle node-exclude",
            {
              type: "exclude_list",
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema
            },
            "cm_excludes",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_indexes) {
          v_node = node.createChildNode(
            "Indexes",
            false,
            "fas node-all fa-thumbtack node-index",
            {
              type: "indexes",
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema
            },
            "cm_indexes",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_rules) {
          v_node = node.createChildNode(
            "Rules",
            false,
            "fas node-all fa-lightbulb node-rule",
            {
              type: "rule_list",
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema
            },
            "cm_rules",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_triggers) {
          v_node = node.createChildNode(
            "Triggers",
            false,
            "fas node-all fa-bolt node-trigger",
            {
              type: "trigger_list",
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema
            },
            "cm_triggers",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_partitions) {
          v_node = node.createChildNode(
            "Inherited Tables",
            false,
            "fas node-all fa-table node-inherited",
            {
              type: "inherited_list",
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema
            },
            "cm_inheriteds",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
          if (parseInt(getMajorVersionPostgresql(node.tree.tag.version)) >= 10) {
            v_node = node.createChildNode(
              "Partitions",
              false,
              "fas node-all fa-table node-partition",
              {
                type: "partition_list",
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                schema: node.tag.schema
              },
              "cm_partitions",
              null,
              false
            );
            v_node.createChildNode("", false, "node-spin", null, null, null, false);
          }
        }
        if (node.tag.has_statistics) {
          if (parseInt(getMajorVersionPostgresql(node.tree.tag.version)) >= 10) {
            v_node = node.createChildNode(
              "Statistics",
              false,
              "fas node-all fa-chart-bar node-statistics",
              {
                type: "statistics_list",
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                schema: node.tag.schema
              },
              "cm_statistics",
              null,
              false
            );
            v_node.createChildNode("", false, "node-spin", null, null, null, false);
          }
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getPKPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_pk_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.text,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        node.setText("Primary Key (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) {
          node.removeChildNodes();
        }
        if (p_return.v_data.length > 0) {
          v_node = node.createChildNode(
            p_return.v_data[0][0],
            false,
            "fas node-all fa-key node-pkey",
            {
              type: "pk",
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema,
              oid: p_return.v_data[0][1]
            },
            "cm_pk"
          );
          v_node.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "pk_field"
            },
            null
          );
        }
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getPKColumnsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_pk_columns_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_key: node.text,
        p_table: node.parent.parent.text,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node.createChildNode(
            p_return.v_data[i][0],
            false,
            "fas node-all fa-columns node-column",
            {
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getUniquesPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_uniques_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.text,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        node.setText("Uniques (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) node.removeChildNodes();
        if (p_return.v_data.length > 0) {
          for (i = 0; i < p_return.v_data.length; i++) {
            v_node = node.createChildNode(
              p_return.v_data[i][0],
              false,
              "fas node-all fa-key node-unique",
              {
                type: "unique",
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                schema: node.tag.schema,
                oid: p_return.v_data[i][1]
              },
              "cm_unique",
              null,
              false
            );
            v_node.createChildNode(
              "",
              false,
              "node-spin",
              {
                type: "unique_field",
                schema: node.tag.schema
              },
              null,
              null,
              false
            );
          }
          node.drawChildNodes();
        }
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getUniquesColumnsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_uniques_columns_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_unique: node.text,
        p_table: node.parent.parent.text,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        if (p_return.v_data.length > 0) {
          for (i = 0; i < p_return.v_data.length; i++) {
            node.createChildNode(
              p_return.v_data[i][0],
              false,
              "fas node-all fa-columns node-column",
              {
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                schema: node.tag.schema
              },
              null,
              null,
              false
            );
          }
          node.drawChildNodes();
        }
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getIndexesPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_indexes_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.text,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        node.setText("Indexes (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) node.removeChildNodes();
        var v_node2;
        if (p_return.v_data.length > 0) {
          for (i = 0; i < p_return.v_data.length; i++) {
            v_node2 = node.createChildNode(
              p_return.v_data[i][0] + " (" + p_return.v_data[i][1] + ")",
              false,
              "fas node-all fa-thumbtack node-index",
              {
                type: "index",
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                schema: node.tag.schema,
                oid: p_return.v_data[i][2]
              },
              "cm_index",
              null,
              false
            );
            v_node2.createChildNode(
              "",
              false,
              "node-spin",
              {
                type: "index_field",
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                schema: node.tag.schema
              },
              null,
              null,
              false
            );
          }
          node.drawChildNodes();
        }
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getIndexesColumnsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_indexes_columns_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_index: node.text.replace(" (Non Unique)", "").replace(" (Unique)", ""),
        p_table: node.parent.parent.text,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        if (p_return.v_data.length > 0) {
          for (i = 0; i < p_return.v_data.length; i++) {
            node.createChildNode(
              p_return.v_data[i][0],
              false,
              "fas node-all fa-columns node-column",
              {
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                schema: node.tag.schema
              },
              null,
              null,
              false
            );
          }
          node.drawChildNodes();
        }
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getFKsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_fks_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.text,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        node.setText("Foreign Keys (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) node.removeChildNodes();
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i][0],
            false,
            "fas node-all fa-key node-fkey",
            {
              type: "foreign_key",
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema,
              oid: p_return.v_data[i][4]
            },
            "cm_fk",
            null,
            false
          );
          v_node.createChildNode(
            "Referenced Table: " + p_return.v_data[i][1],
            false,
            "fas node-all fa-table node-table",
            {
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema
            },
            null,
            null,
            false
          );
          v_node.createChildNode(
            "Delete Rule: " + p_return.v_data[i][2],
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            {
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema
            },
            null,
            null,
            false
          );
          v_node.createChildNode(
            "Update Rule: " + p_return.v_data[i][3],
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            {
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema
            },
            null,
            null,
            false
          );
          v_curr_fk = p_return.v_data[i][0];
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getFKsColumnsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_fks_columns_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_fkey: node.text,
        p_table: node.parent.parent.text,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.createChildNode(
          "Referenced Table: " + p_return.v_data[0][0],
          false,
          "fas node-all fa-table node-table",
          {
            database: v_connTabControl.selectedTab.tag.selectedDatabase,
            schema: node.tag.schema
          },
          null,
          null,
          false
        );
        node.createChildNode(
          "Delete Rule: " + p_return.v_data[0][1],
          false,
          "fas node-all fa-ellipsis-h node-bullet",
          {
            database: v_connTabControl.selectedTab.tag.selectedDatabase,
            schema: node.tag.schema
          },
          null,
          null,
          false
        );
        node.createChildNode(
          "Update Rule: " + p_return.v_data[0][2],
          false,
          "fas node-all fa-ellipsis-h node-bullet",
          {
            database: v_connTabControl.selectedTab.tag.selectedDatabase,
            schema: node.tag.schema
          },
          null,
          null,
          false
        );
        for (i = 0; i < p_return.v_data.length; i++) {
          node.createChildNode(
            p_return.v_data[i][3] + " <i class='fas node-all fa-arrow-right'></i> " + p_return.v_data[i][4],
            false,
            "fas node-all fa-columns node-column",
            {
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getChecksPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_checks_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.text,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        node.setText("Checks (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) node.removeChildNodes();
        var v_node2;
        if (p_return.v_data.length > 0) {
          for (i = 0; i < p_return.v_data.length; i++) {
            v_node2 = node.createChildNode(
              p_return.v_data[i][0],
              false,
              "fas node-all fa-check-square node-check",
              {
                type: "check",
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                schema: node.tag.schema,
                oid: p_return.v_data[i][2]
              },
              "cm_check",
              null,
              false
            );
            v_node2.createChildNode(
              p_return.v_data[i][1],
              false,
              "fas node-all fa-edit node-check-value",
              {
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                schema: node.tag.schema
              },
              null,
              null,
              false
            );
          }
          node.drawChildNodes();
        }
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getExcludesPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_excludes_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.text,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        node.setText("Excludes (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) node.removeChildNodes();
        var v_node2;
        if (p_return.v_data.length > 0) {
          for (i = 0; i < p_return.v_data.length; i++) {
            v_node2 = node.createChildNode(
              p_return.v_data[i][0],
              false,
              "fas node-all fa-times-circle node-exclude",
              {
                type: "exclude",
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                schema: node.tag.schema,
                oid: p_return.v_data[i][3]
              },
              "cm_exclude",
              null,
              false
            );
            v_node2.createChildNode(
              "Attributes: " + p_return.v_data[i][1],
              false,
              "fas node-all fa-ellipsis-h node-bullet",
              {
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                schema: node.tag.schema
              },
              null,
              null,
              false
            );
            v_node2.createChildNode(
              "Operators: " + p_return.v_data[i][2],
              false,
              "fas node-all fa-ellipsis-h node-bullet",
              {
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                schema: node.tag.schema
              },
              null,
              null,
              false
            );
          }
          node.drawChildNodes();
        }
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getRulesPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_rules_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.text,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        node.setText("Rules (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) node.removeChildNodes();
        if (p_return.v_data.length > 0) {
          for (i = 0; i < p_return.v_data.length; i++) {
            node.createChildNode(
              p_return.v_data[i][0],
              false,
              "fas node-all fa-lightbulb node-rule",
              {
                type: "rule",
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                schema: node.tag.schema,
                oid: p_return.v_data[i][1]
              },
              "cm_rule",
              null,
              false
            );
          }
          node.drawChildNodes();
        }
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getRuleDefinitionPostgresql(node) {
    execAjax(
      "/get_rule_definition_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_rule: node.text,
        p_table: node.parent.parent.text,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data);
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
        renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);
        var v_div_result = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;
        if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht != null) {
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht.destroy();
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht = null;
        }
        v_div_result.innerHTML = "";
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      true
    );
  }
  function getTriggersPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_triggers_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.text,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        node.setText("Triggers (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) node.removeChildNodes();
        if (p_return.v_data.length > 0) {
          for (i = 0; i < p_return.v_data.length; i++) {
            var v_node2 = node.createChildNode(
              p_return.v_data[i].v_name,
              false,
              "fas node-all fa-bolt node-trigger",
              {
                type: "trigger",
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                schema: node.tag.schema,
                oid: p_return.v_data[i].v_oid
              },
              "cm_trigger",
              null,
              true
            );
            v_node2.createChildNode(
              "Enabled: " + p_return.v_data[i].v_enabled,
              false,
              "fas node-all fa-ellipsis-h node-bullet",
              {
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                schema: node.tag.schema
              },
              null,
              null,
              false
            );
            v_node2.createChildNode(
              p_return.v_data[i].v_function,
              false,
              "fas node-all fa-cog node-tfunction",
              {
                type: "direct_triggerfunction",
                id: p_return.v_data[i].v_id,
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                schema: node.tag.schema,
                function_oid: p_return.v_data[i].v_function_oid
              },
              "cm_direct_triggerfunction",
              null,
              true
            );
          }
          node.drawChildNodes();
        }
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getEventTriggersPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_eventtriggers_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id
      }),
      function(p_return) {
        node.setText("Event Triggers (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) node.removeChildNodes();
        if (p_return.v_data.length > 0) {
          for (i = 0; i < p_return.v_data.length; i++) {
            var v_node2 = node.createChildNode(
              p_return.v_data[i].v_name,
              false,
              "fas node-all fa-bolt node-eventtrigger",
              {
                type: "eventtrigger",
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                oid: p_return.v_data[i].v_oid
              },
              "cm_eventtrigger",
              null,
              true
            );
            v_node2.createChildNode(
              "Enabled: " + p_return.v_data[i].v_enabled,
              false,
              "fas node-all fa-ellipsis-h node-bullet",
              {
                database: v_connTabControl.selectedTab.tag.selectedDatabase
              },
              null,
              null,
              false
            );
            v_node2.createChildNode(
              "Event: " + p_return.v_data[i].v_event,
              false,
              "fas node-all fa-ellipsis-h node-bullet",
              {
                database: v_connTabControl.selectedTab.tag.selectedDatabase
              },
              null,
              null,
              false
            );
            v_node2.createChildNode(
              p_return.v_data[i].v_function,
              false,
              "fas node-all fa-cog node-etfunction",
              {
                type: "direct_eventtriggerfunction",
                id: p_return.v_data[i].v_id,
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                function_oid: p_return.v_data[i].v_function_oid
              },
              "cm_direct_eventtriggerfunction",
              null,
              true
            );
          }
          node.drawChildNodes();
        }
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getInheritedsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_inheriteds_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.text,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        node.setText("Inherited Tables (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) node.removeChildNodes();
        if (p_return.v_data.length > 0) {
          for (i = 0; i < p_return.v_data.length; i++) {
            node.createChildNode(
              p_return.v_data[i][0],
              false,
              "fas node-all fa-table node-inherited",
              {
                type: "inherit",
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                schema: node.tag.schema
              },
              "cm_inherit",
              null,
              false
            );
          }
          node.drawChildNodes();
        }
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getPartitionsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_partitions_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.text,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        node.setText("Partitions (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) node.removeChildNodes();
        if (p_return.v_data.length > 0) {
          for (i = 0; i < p_return.v_data.length; i++) {
            node.createChildNode(
              p_return.v_data[i][0],
              false,
              "fas node-all fa-table node-partition",
              {
                type: "partition",
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                schema: node.tag.schema
              },
              "cm_partition",
              null,
              false
            );
          }
          node.drawChildNodes();
        }
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getStatisticsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_statistics_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.text,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        node.setText("Statistics (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) {
          node.removeChildNodes();
        }
        var v_node2;
        if (p_return.v_data.length > 0) {
          for (i = 0; i < p_return.v_data.length; i++) {
            v_node2 = node.createChildNode(
              p_return.v_data[i][1] + "." + p_return.v_data[i][0],
              false,
              "fas node-all fa-chart-bar node-statistic",
              {
                type: "statistic",
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                schema: p_return.v_data[i][1],
                statistics: p_return.v_data[i][0],
                oid: p_return.v_data[i][2]
              },
              "cm_statistic",
              null,
              false
            );
            v_node2.createChildNode("", true, "node-spin", null, null, null, false);
          }
          node.drawChildNodes();
        }
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getStatisticsColumnsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_statistics_columns_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_statistics: node.tag.statistics,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        if (node.childNodes.length > 0) {
          node.removeChildNodes();
        }
        if (p_return.v_data.length > 0) {
          for (i = 0; i < p_return.v_data.length; i++) {
            node.createChildNode(
              p_return.v_data[i]["v_column_name"],
              false,
              "fas node-all fa-columns node-column",
              {
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                schema: node.tag.schema
              },
              null,
              null,
              false
            );
          }
          node.drawChildNodes();
        }
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getFunctionsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_functions_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Functions (" + p_return.v_data.length + ")");
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-cog node-function",
            {
              type: "function",
              id: p_return.v_data[i].v_id,
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema,
              function_oid: p_return.v_data[i].v_function_oid
            },
            "cm_function",
            null,
            false
          );
          v_node.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "function_field",
              schema: node.tag.schema
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getFunctionFieldsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_function_fields_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_function: node.tag.id,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          if (p_return.v_data[i].v_type == "O")
            v_node = node.createChildNode(
              p_return.v_data[i].v_name,
              false,
              "fas node-all fa-arrow-right node-function-field",
              {
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                schema: node.tag.schema
              },
              null,
              null,
              false
            );
          else {
            if (p_return.v_data[i].v_type == "I")
              v_node = node.createChildNode(
                p_return.v_data[i].v_name,
                false,
                "fas node-all fa-arrow-left node-function-field",
                {
                  database: v_connTabControl.selectedTab.tag.selectedDatabase,
                  schema: node.tag.schema
                },
                null,
                null,
                false
              );
            else
              v_node = node.createChildNode(
                p_return.v_data[i].v_name,
                false,
                "fas node-all fa-exchange-alt node-function-field",
                {
                  database: v_connTabControl.selectedTab.tag.selectedDatabase,
                  schema: node.tag.schema
                },
                null,
                null,
                false
              );
          }
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getFunctionDefinitionPostgresql(node) {
    execAjax(
      "/get_function_definition_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_function: node.tag.id
      }),
      function(p_return) {
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data);
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
        renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);
        var v_div_result = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;
        if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht != null) {
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht.destroy();
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht = null;
        }
        v_div_result.innerHTML = "";
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      true
    );
  }
  function getProceduresPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_procedures_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Procedures (" + p_return.v_data.length + ")");
        node.tag.num_procedures = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-cog node-procedure",
            {
              type: "procedure",
              id: p_return.v_data[i].v_id,
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema,
              function_oid: p_return.v_data[i].v_function_oid
            },
            "cm_procedure",
            null,
            false
          );
          v_node.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "procedure_field",
              schema: node.tag.schema
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getProcedureFieldsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_procedure_fields_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_procedure: node.tag.id,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.tag.num_fields = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          if (p_return.v_data[i].v_type == "O")
            v_node = node.createChildNode(
              p_return.v_data[i].v_name,
              false,
              "fas node-all fa-arrow-right node-function-field",
              {
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                schema: node.tag.schema
              },
              null,
              null,
              false
            );
          else {
            if (p_return.v_data[i].v_type == "I")
              v_node = node.createChildNode(
                p_return.v_data[i].v_name,
                false,
                "fas node-all fa-arrow-left node-function-field",
                {
                  database: v_connTabControl.selectedTab.tag.selectedDatabase,
                  schema: node.tag.schema
                },
                null,
                null,
                false
              );
            else
              v_node = node.createChildNode(
                p_return.v_data[i].v_name,
                false,
                "fas node-all fa-exchange-alt node-function-field",
                {
                  database: v_connTabControl.selectedTab.tag.selectedDatabase,
                  schema: node.tag.schema
                },
                null,
                null,
                false
              );
          }
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getProcedureDefinitionPostgresql(node) {
    execAjax(
      "/get_procedure_definition_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_procedure: node.tag.id
      }),
      function(p_return) {
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data);
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
        renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);
        var v_div_result = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;
        if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht != null) {
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht.destroy();
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht = null;
        }
        v_div_result.innerHTML = "";
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      true
    );
  }
  function getTriggerFunctionsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_triggerfunctions_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Trigger Functions (" + p_return.v_data.length + ")");
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-cog node-tfunction",
            {
              type: "triggerfunction",
              id: p_return.v_data[i].v_id,
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema,
              function_oid: p_return.v_data[i].v_function_oid
            },
            "cm_triggerfunction",
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getTriggerFunctionDefinitionPostgresql(node) {
    execAjax(
      "/get_triggerfunction_definition_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_function: node.tag.id
      }),
      function(p_return) {
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data);
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
        renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);
        var v_div_result = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;
        if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht != null) {
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht.destroy();
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht = null;
        }
        v_div_result.innerHTML = "";
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      true
    );
  }
  function getEventTriggerFunctionsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_eventtriggerfunctions_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Event Trigger Functions (" + p_return.v_data.length + ")");
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-cog node-etfunction",
            {
              type: "eventtriggerfunction",
              id: p_return.v_data[i].v_id,
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema,
              function_oid: p_return.v_data[i].v_function_oid
            },
            "cm_eventtriggerfunction",
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getEventTriggerFunctionDefinitionPostgresql(node) {
    execAjax(
      "/get_eventtriggerfunction_definition_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_function: node.tag.id
      }),
      function(p_return) {
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data);
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
        renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);
        var v_div_result = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;
        if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht != null) {
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht.destroy();
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht = null;
        }
        v_div_result.innerHTML = "";
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      true
    );
  }
  function getAggregatesPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_aggregates_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        if (node.childNodes.length > 0) {
          node.removeChildNodes();
        }
        node.setText("Aggregates (" + p_return.v_data.length + ")");
        node.tag.num_aggregates = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-cog node-aggregate",
            {
              type: "aggregate",
              id: p_return.v_data[i].v_id,
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema,
              oid: p_return.v_data[i].v_oid
            },
            "cm_aggregate",
            null,
            false
          );
          v_node.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "aggregate_field",
              schema: node.tag.schema
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getPhysicalReplicationSlotsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_physicalreplicationslots_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Physical Replication Slots (" + p_return.v_data.length + ")");
        node.tag.num_repslots = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-sitemap node-repslot",
            {
              type: "physicalreplicationslot",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_physicalreplicationslot",
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getLogicalReplicationSlotsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_logicalreplicationslots_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Logical Replication Slots (" + p_return.v_data.length + ")");
        node.tag.num_repslots = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-sitemap node-repslot",
            {
              type: "logicalreplicationslot",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_logicalreplicationslot",
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getPublicationsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_publications_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Publications (" + p_return.v_data.length + ")");
        node.tag.num_pubs = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-arrow-alt-circle-down node-publication",
            {
              type: "publication",
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              oid: p_return.v_data[i].v_oid
            },
            "cm_publication",
            null,
            false
          );
          v_node.createChildNode(
            "All Tables: " + p_return.v_data[i].v_alltables,
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            {
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
          v_node.createChildNode(
            "Insert: " + p_return.v_data[i].v_insert,
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            {
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
          v_node.createChildNode(
            "Update: " + p_return.v_data[i].v_update,
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            {
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
          v_node.createChildNode(
            "Delete: " + p_return.v_data[i].v_delete,
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            {
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
          v_node.createChildNode(
            "Truncate: " + p_return.v_data[i].v_truncate,
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            {
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
          if (p_return.v_data[i].v_alltables == "False") {
            v_tables = v_node.createChildNode(
              "Tables",
              false,
              "fas node-all fa-th node-table-list",
              {
                type: "publication_table_list",
                database: v_connTabControl.selectedTab.tag.selectedDatabase
              },
              "cm_pubtables",
              null,
              false
            );
            v_tables.createChildNode("", true, "node-spin", null, null, null, false);
          }
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getPublicationTablesPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_publication_tables_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_pub: node.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Tables (" + p_return.v_data.length + ")");
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-table node-table",
            {
              type: "pubtable",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_pubtable",
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getSubscriptionsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_subscriptions_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Subscriptions (" + p_return.v_data.length + ")");
        node.tag.num_subs = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-arrow-alt-circle-up node-subscription",
            {
              type: "subscription",
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              oid: p_return.v_data[i].v_oid
            },
            "cm_subscription",
            null,
            false
          );
          v_node.createChildNode(
            "Enabled: " + p_return.v_data[i].v_enabled,
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            {
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
          v_node.createChildNode(
            "ConnInfo: " + p_return.v_data[i].v_conninfo,
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            {
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
          v_publications = v_node.createChildNode(
            "Referenced Publications",
            false,
            "fas node-all fa-arrow-alt-circle-down node-publication",
            {
              type: "subpubs",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
          tmp = p_return.v_data[i].v_publications.split(",");
          for (j = 0; j < tmp.length; j++) {
            v_publications.createChildNode(
              tmp[j],
              false,
              "fas node-all fa-arrow-alt-circle-down node-publication",
              {
                type: "subpub",
                database: v_connTabControl.selectedTab.tag.selectedDatabase
              },
              null,
              null,
              false
            );
          }
          v_tables = v_node.createChildNode(
            "Tables",
            false,
            "fas node-all fa-th node-table-list",
            {
              type: "subscription_table_list",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
          v_tables.createChildNode("", true, "node-spin", null, null, null, false);
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getSubscriptionTablesPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_subscription_tables_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_sub: node.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Tables (" + p_return.v_data.length + ")");
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-table node-table",
            {
              type: "subtable",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getForeignDataWrappersPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_foreign_data_wrappers_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Foreign Data Wrappers (" + p_return.v_data.length + ")");
        node.tag.num_fdws = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-cube node-fdw",
            {
              type: "fdw",
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              oid: p_return.v_data[i].v_oid
            },
            "cm_fdw",
            null,
            false
          );
          v_node = v_node.createChildNode(
            "Foreign Servers",
            false,
            "fas node-all fa-server node-server",
            {
              type: "foreign_server_list",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_foreign_servers",
            null,
            false
          );
          v_node.createChildNode("", true, "node-spin", null, null, null, false);
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getForeignServersPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_foreign_servers_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_fdw: node.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Foreign Servers (" + p_return.v_data.length + ")");
        node.tag.num_foreign_servers = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-server node-server",
            {
              type: "foreign_server",
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              oid: p_return.v_data[i].v_oid
            },
            "cm_foreign_server",
            null,
            false
          );
          if (p_return.v_data[i].v_type != null) {
            v_node.createChildNode(
              "Type: " + p_return.v_data[i].v_type,
              true,
              "fas node-all fa-ellipsis-h node-bullet",
              {
                database: v_connTabControl.selectedTab.tag.selectedDatabase
              },
              null,
              null,
              false
            );
          }
          if (p_return.v_data[i].v_version != null) {
            v_node.createChildNode(
              "Version: " + p_return.v_data[i].v_version,
              true,
              "fas node-all fa-ellipsis-h node-bullet",
              {
                database: v_connTabControl.selectedTab.tag.selectedDatabase
              },
              null,
              null,
              false
            );
          }
          if (p_return.v_data[i].v_options != null) {
            v_options = p_return.v_data[i].v_options.split(",");
            if (v_options[0] != "") {
              for (j = 0; j < v_options.length; j++) {
                v_node.createChildNode(
                  v_options[j],
                  true,
                  "fas node-all fa-ellipsis-h node-bullet",
                  {
                    database: v_connTabControl.selectedTab.tag.selectedDatabase
                  },
                  null,
                  null,
                  false
                );
              }
            }
          }
          v_node = v_node.createChildNode(
            "User Mappings",
            false,
            "fas node-all fa-user-friends node-user",
            {
              type: "user_mapping_list",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_user_mappings",
            null,
            false
          );
          v_node.createChildNode("", true, "node-spin", null, null, null, false);
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getUserMappingsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_user_mappings_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_foreign_server: node.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("User Mappings (" + p_return.v_data.length + ")");
        node.tag.num_user_mappings = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-user-friends node-user",
            {
              type: "user_mapping",
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              foreign_server: p_return.v_data[i].v_foreign_server
            },
            "cm_user_mapping",
            null,
            false
          );
          if (p_return.v_data[i].v_options != null) {
            v_options = p_return.v_data[i].v_options.split(",");
            if (v_options[0] != "") {
              for (j = 0; j < v_options.length; j++) {
                v_node.createChildNode(
                  v_options[j],
                  true,
                  "fas node-all fa-ellipsis-h node-bullet",
                  {
                    database: v_connTabControl.selectedTab.tag.selectedDatabase
                  },
                  null,
                  null,
                  false
                );
              }
            }
          }
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getForeignTablesPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_foreign_tables_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Foreign Tables (" + p_return.v_data.length + ")");
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-table node-ftable",
            {
              type: "foreign_table",
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              has_statistics: p_return.v_data[i].v_has_statistics,
              schema: node.tag.schema,
              oid: p_return.v_data[i].v_oid
            },
            "cm_foreign_table",
            null,
            false
          );
          v_node.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "foreign_table_field",
              schema: node.tag.schema
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getForeignColumnsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_foreign_columns_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.text,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        v_list = node.createChildNode(
          "Columns (" + p_return.v_data.length + ")",
          false,
          "fas node-all fa-columns node-column",
          {
            type: "foreign_column_list",
            database: v_connTabControl.selectedTab.tag.selectedDatabase,
            schema: node.tag.schema
          },
          "cm_foreign_columns",
          null,
          false
        );
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = v_list.createChildNode(
            p_return.v_data[i].v_column_name,
            false,
            "fas node-all fa-columns node-column",
            {
              type: "foreign_table_field",
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema
            },
            "cm_foreign_column",
            null,
            false
          );
          v_node.createChildNode(
            "Type: " + p_return.v_data[i].v_data_type,
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            {
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema
            },
            null,
            null,
            false
          );
          v_node.createChildNode(
            "Nullable: " + p_return.v_data[i].v_nullable,
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            {
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema
            },
            null,
            null,
            false
          );
          if (p_return.v_data[i].v_options != null) {
            v_options = p_return.v_data[i].v_options.split(",");
            if (v_options[0] != "") {
              for (j = 0; j < v_options.length; j++) {
                v_node.createChildNode(
                  v_options[j],
                  true,
                  "fas node-all fa-ellipsis-h node-bullet",
                  {
                    database: v_connTabControl.selectedTab.tag.selectedDatabase,
                    schema: node.tag.schema
                  },
                  null,
                  null,
                  false
                );
              }
            }
          }
        }
        if (p_return.v_data[0].v_tableoptions != null) {
          v_options = p_return.v_data[0].v_tableoptions.split(",");
          if (v_options[0] != "") {
            for (j = 0; j < v_options.length; j++) {
              node.createChildNode(
                v_options[j],
                true,
                "fas node-all fa-ellipsis-h node-bullet",
                {
                  database: v_connTabControl.selectedTab.tag.selectedDatabase,
                  schema: node.tag.schema
                },
                null,
                null,
                false
              );
            }
          }
        }
        node.createChildNode(
          p_return.v_data[0].v_server,
          true,
          "fas node-all fa-server node-server",
          {
            database: v_connTabControl.selectedTab.tag.selectedDatabase,
            schema: node.tag.schema
          },
          null,
          null,
          false
        );
        node.createChildNode(
          p_return.v_data[0].v_fdw,
          true,
          "fas node-all fa-cube node-fdw",
          {
            database: v_connTabControl.selectedTab.tag.selectedDatabase,
            schema: node.tag.schema
          },
          null,
          null,
          false
        );
        if (node.tag.has_statistics) {
          if (parseInt(getMajorVersionPostgresql(node.tree.tag.version)) >= 10) {
            v_node = node.createChildNode(
              "Statistics",
              false,
              "fas node-all fa-chart-bar node-statistics",
              {
                type: "statistics_list",
                database: v_connTabControl.selectedTab.tag.selectedDatabase,
                schema: node.tag.schema
              },
              "cm_statistics",
              null,
              false
            );
            v_node.createChildNode("", false, "node-spin", null, null, null, false);
          }
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getTypesPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_types_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        node.setText("Types (" + p_return.v_data.length + ")");
        node.tag.num_types = p_return.v_data.length;
        if (node.childNodes.length > 0) node.removeChildNodes();
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_type_name,
            false,
            "fas node-all fa-square node-type",
            {
              type: "type",
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema,
              oid: p_return.v_data[i].v_oid
            },
            "cm_type",
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getDomainsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_domains_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        node.setText("Domains (" + p_return.v_data.length + ")");
        node.tag.num_domains = p_return.v_data.length;
        if (node.childNodes.length > 0) node.removeChildNodes();
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_domain_name,
            false,
            "fas node-all fa-square node-domain",
            {
              type: "domain",
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema,
              oid: p_return.v_data[i].v_oid
            },
            "cm_domain",
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getPartitionedParentsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_partitions_parents_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Partitioned Tables (" + p_return.v_data.length + ")");
        node.tag.num_partitioned = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-layer-group node-ptable",
            {
              type: "partitioned_parent",
              id: p_return.v_data[i].v_name,
              num_tables: 0,
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema
            },
            "cm_partitioned_parent",
            null,
            false
          );
          v_node.createChildNode("", true, "node-spin", null, null, null, false);
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getPartitionedChildrenPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_partitions_children_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: node.tag.schema,
        p_table: node.tag.id
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText(node.tag.id + " (" + p_return.v_data.length + ")");
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-table node-ptable",
            {
              type: "table",
              has_primary_keys: p_return.v_data[i].v_has_primary_keys,
              has_foreign_keys: p_return.v_data[i].v_has_foreign_keys,
              has_uniques: p_return.v_data[i].v_has_uniques,
              has_indexes: p_return.v_data[i].v_has_indexes,
              has_checks: p_return.v_data[i].v_has_checks,
              has_excludes: p_return.v_data[i].v_has_excludes,
              has_rules: p_return.v_data[i].v_has_rules,
              has_triggers: p_return.v_data[i].v_has_triggers,
              has_partitions: p_return.v_data[i].v_has_partitions,
              has_statistics: p_return.v_data[i].v_has_statistics,
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema,
              oid: p_return.v_data[i].v_oid
            },
            "cm_table",
            null,
            false
          );
          v_node.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "table_field",
              schema: node.tag.schema
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getInheritedsParentsPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_inheriteds_parents_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: node.tag.schema
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Inheritance Tables (" + p_return.v_data.length + ")");
        node.tag.num_partitioned = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-layer-group node-itable",
            {
              type: "inherited_parent",
              id: p_return.v_data[i].v_name,
              num_tables: 0,
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema
            },
            "cm_inherited_parent",
            null,
            false
          );
          v_node.createChildNode("", true, "node-spin", null, null, null, false);
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function getInheritedsChildrenPostgresql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_inheriteds_children_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: node.tag.schema,
        p_table: node.tag.id
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText(node.tag.id + " (" + p_return.v_data.length + ")");
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-table node-itable",
            {
              type: "table",
              has_primary_keys: p_return.v_data[i].v_has_primary_keys,
              has_foreign_keys: p_return.v_data[i].v_has_foreign_keys,
              has_uniques: p_return.v_data[i].v_has_uniques,
              has_indexes: p_return.v_data[i].v_has_indexes,
              has_checks: p_return.v_data[i].v_has_checks,
              has_excludes: p_return.v_data[i].v_has_excludes,
              has_rules: p_return.v_data[i].v_has_rules,
              has_triggers: p_return.v_data[i].v_has_triggers,
              has_partitions: p_return.v_data[i].v_has_partitions,
              has_statistics: p_return.v_data[i].v_has_statistics,
              database: v_connTabControl.selectedTab.tag.selectedDatabase,
              schema: node.tag.schema,
              oid: p_return.v_data[i].v_oid
            },
            "cm_table",
            null,
            false
          );
          v_node.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "table_field",
              schema: node.tag.schema
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackPostgreSQL(node);
      },
      function(p_return) {
        nodeOpenErrorPostgresql(p_return, node);
      },
      "box",
      false
    );
  }
  function TemplateSelectPostgresql(p_schema, p_table, p_kind) {
    execAjax(
      "/template_select_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table,
        p_schema,
        p_kind
      }),
      function(p_return) {
        let v_tab_name = p_schema + "." + p_table;
        v_connTabControl.tag.createQueryTab(v_tab_name);
        var v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;
        v_tab_tag.editor.setValue(p_return.v_data.v_template);
        v_tab_tag.editor.clearSelection();
        querySQL(0);
      },
      function(p_return) {
        showError(p_return.v_data);
        return "";
      },
      "box",
      true
    );
  }
  function TemplateInsertPostgresql(p_schema, p_table) {
    execAjax(
      "/template_insert_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table,
        p_schema
      }),
      function(p_return) {
        tabSQLTemplate$1("Insert " + p_schema + "." + p_table, p_return.v_data.v_template);
      },
      function(p_return) {
        showError(p_return.v_data);
        return "";
      },
      "box",
      true
    );
  }
  function TemplateUpdatePostgresql(p_schema, p_table) {
    execAjax(
      "/template_update_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table,
        p_schema
      }),
      function(p_return) {
        tabSQLTemplate$1("Update " + p_schema + "." + p_table, p_return.v_data.v_template);
      },
      function(p_return) {
        showError(p_return.v_data);
        return "";
      },
      "box",
      true
    );
  }
  function TemplateSelectFunctionPostgresql(p_schema, p_function, p_functionid) {
    execAjax(
      "/template_select_function_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_function,
        p_functionid,
        p_schema
      }),
      function(p_return) {
        tabSQLTemplate$1("Select " + p_schema + "." + p_function, p_return.v_data.v_template);
      },
      function(p_return) {
        showError(p_return.v_data);
        return "";
      },
      "box",
      true
    );
  }
  function TemplateCallProcedurePostgresql(p_schema, p_procedure, p_procedureid) {
    execAjax(
      "/template_call_procedure_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_procedure,
        p_procedureid,
        p_schema
      }),
      function(p_return) {
        tabSQLTemplate$1("Call " + p_schema + "." + p_procedure, p_return.v_data.v_template);
      },
      function(p_return) {
        showError(p_return.v_data);
        return "";
      },
      "box",
      true
    );
  }
  function nodeOpenErrorPostgresql(p_return, p_node) {
    if (p_return.v_data.password_timeout) {
      p_node.collapseNode();
      showPasswordPrompt(
        v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        function() {
          p_node.expandNode();
        },
        null,
        p_return.v_data.message
      );
    } else {
      if (p_node.childNodes.length > 0) p_node.removeChildNodes();
      v_node = p_node.createChildNode(
        "Error - <a class='a_link' onclick='showError(&quot;" + p_return.v_data.replace(/\n/g, "<br/>").replace(/"/g, "") + "&quot;)'>View Detail</a>",
        false,
        "fas fa-times node-error",
        {
          type: "error",
          message: p_return.v_data
        },
        null
      );
    }
  }
  function getMajorVersionPostgresql(p_version) {
    var v_version = p_version.split(" (")[0];
    var tmp2 = v_version.replace("PostgreSQL ", "").replace("beta", ".").replace("rc", ".").split(".");
    tmp2.pop();
    return tmp2.join(".");
  }
  function postgresqlTerminateBackendConfirm(p_pid) {
    execAjax(
      "/kill_backend_postgresql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_pid
      }),
      function(p_return) {
        refreshMonitoring();
      },
      function(p_return) {
        if (p_return.v_data.password_timeout) {
          showPasswordPrompt(
            v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
            function() {
              postgresqlTerminateBackendConfirm(p_pid);
            },
            null,
            p_return.v_data.message
          );
        } else {
          showError(p_return.v_data);
        }
      },
      "box",
      true
    );
  }
  function postgresqlTerminateBackend(p_row) {
    var v_pid = p_row[2];
    showConfirm("Are you sure you want to terminate backend " + v_pid + "?", function() {
      postgresqlTerminateBackendConfirm(v_pid);
    });
  }
  function getExplain(p_mode) {
    v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;
    var v_query;
    var v_selected_text = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.getSelectedText();
    if (v_selected_text != "") v_query = v_selected_text;
    else v_query = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.getValue();
    if (v_query.trim() == "") {
      showAlert("Please provide a string.");
    } else {
      if (v_explain_control.context === "default") {
        if (p_mode == 0) {
          v_query = "explain " + v_query;
        } else if (p_mode == 1) {
          v_query = "explain (analyze, buffers) " + v_query;
        }
        querySQL(0, true, v_query, getExplainReturn, true);
      } else {
        if (p_mode == 0) {
          v_query = "explain (format json) " + v_query;
        } else if (p_mode == 1) {
          v_query = "explain (analyze, buffers, format json) " + v_query;
        }
        querySQL(0, true, v_query, getExplainReturn, true);
      }
    }
  }
  function getExplainReturn(p_data) {
    var v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;
    v_tab_tag.selectExplainTabFunc();
    if (p_data.v_error) {
      var v_expl_err = document.createElement("div");
      v_expl_err.className = "error_text";
      v_expl_err.textContent = p_data.v_data.message;
      v_tab_tag.div_explain_default.innerHTML = "";
      v_tab_tag.div_explain_default.appendChild(v_expl_err.cloneNode(true));
      v_tab_tag.div_explain.innerHTML = "";
      v_tab_tag.div_explain.appendChild(v_expl_err);
    } else {
      var v_explain_text = "";
      for (var i2 = 0; i2 < p_data.v_data.v_data.length; i2++) {
        v_explain_text += p_data.v_data.v_data[i2] + "\n";
      }
      if (v_tab_tag.explainControl) {
        v_tab_tag.explainControl.destroy();
      }
      v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_explain_default.innerHTML = "";
      if (v_explain_control.context === "default") {
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_explain_default.style.display = "block";
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_explain.style.display = "none";
        var resultset = [];
        v_explain_text.split(/\n/).forEach(function(item) {
          item = item.replace(/^"(.*)"$/, "$1");
          item = item.replace(/^'(.*)'$/, "$1");
          if (item.match(/^-*$/)) {
            return;
          }
          if (item.match(/^\s*QUERY PLAN\s*$/)) {
            return;
          }
          resultset.push([item]);
        });
        if (resultset.length > 0) {
          var planNodes = PGPlanNodes(resultset.slice());
          var mountNode = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_explain_default;
          var pgplan = React.createElement(
            PGPlan,
            {
              nodes: planNodes
            },
            null
          );
          ReactDOM.render(pgplan, mountNode);
        }
      } else {
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_explain_default.style.display = "none";
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_explain.style.display = "block";
        var v_legere_options = {
          backgroundColor: v_editor_theme === "omnidb_dark" ? "#2f3136" : "#e2e2e2",
          target: v_tab_tag.div_explain
        };
        var v_context = {
          parent: v_tab_tag,
          self: "explainControl"
        };
        v_tab_tag.explainControl = createLegere(v_context, v_legere_options);
        v_tab_tag.explainControl.updatePlanList(JSON.parse(v_explain_text));
      }
    }
    refreshHeights();
  }
  const treePostgresql = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    TemplateCallProcedurePostgresql,
    TemplateInsertPostgresql,
    TemplateSelectFunctionPostgresql,
    TemplateSelectPostgresql,
    TemplateUpdatePostgresql,
    afterNodeOpenedCallbackPostgreSQL,
    checkCurrentDatabase,
    getAggregatesPostgresql,
    getChecksPostgresql,
    getColumnsPostgresql,
    getDatabaseObjectsPostgresql,
    getDatabasesPostgresql,
    getDomainsPostgresql,
    getEventTriggerFunctionDefinitionPostgresql,
    getEventTriggerFunctionsPostgresql,
    getEventTriggersPostgresql,
    getExcludesPostgresql,
    getExplain,
    getExplainReturn,
    getExtensionsPostgresql,
    getFKsColumnsPostgresql,
    getFKsPostgresql,
    getForeignColumnsPostgresql,
    getForeignDataWrappersPostgresql,
    getForeignServersPostgresql,
    getForeignTablesPostgresql,
    getFunctionDefinitionPostgresql,
    getFunctionFieldsPostgresql,
    getFunctionsPostgresql,
    getIndexesColumnsPostgresql,
    getIndexesPostgresql,
    getInheritedsChildrenPostgresql,
    getInheritedsParentsPostgresql,
    getInheritedsPostgresql,
    getLogicalReplicationSlotsPostgresql,
    getMajorVersionPostgresql,
    getMaterializedViewDefinitionPostgresql,
    getMaterializedViewsColumnsPostgresql,
    getMaterializedViewsPostgresql,
    getObjectDescriptionPostgresql,
    getPKColumnsPostgresql,
    getPKPostgresql,
    getPartitionedChildrenPostgresql,
    getPartitionedParentsPostgresql,
    getPartitionsPostgresql,
    getPhysicalReplicationSlotsPostgresql,
    getProcedureDefinitionPostgresql,
    getProcedureFieldsPostgresql,
    getProceduresPostgresql,
    getPropertiesPostgresql,
    getPropertiesPostgresqlConfirm,
    getPublicationTablesPostgresql,
    getPublicationsPostgresql,
    getRolesPostgresql,
    getRuleDefinitionPostgresql,
    getRulesPostgresql,
    getSchemasPostgresql,
    getSequencesPostgresql,
    getStatisticsColumnsPostgresql,
    getStatisticsPostgresql,
    getSubscriptionTablesPostgresql,
    getSubscriptionsPostgresql,
    getTablesPostgresql,
    getTablespacesPostgresql,
    getTreeDetailsPostgresql,
    getTreePostgresql,
    getTriggerFunctionDefinitionPostgresql,
    getTriggerFunctionsPostgresql,
    getTriggersPostgresql,
    getTypesPostgresql,
    getUniquesColumnsPostgresql,
    getUniquesPostgresql,
    getUserMappingsPostgresql,
    getViewDefinitionPostgresql,
    getViewsColumnsPostgresql,
    getViewsPostgresql,
    nodeOpenErrorPostgresql,
    postgresqlTerminateBackend,
    postgresqlTerminateBackendConfirm,
    refreshTreePostgresql,
    refreshTreePostgresqlConfirm,
    tabAdvancedObjectSearch,
    tabSQLTemplate: tabSQLTemplate$1
  }, Symbol.toStringTag, { value: "Module" }));
  function getTreeOracle(p_div) {
    var context_menu = {
      cm_server: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeOracle$1(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          }
        ]
      },
      cm_connection: {
        elements: [
          {
            text: "Render Graph",
            icon: "fab cm-all fa-hubspot",
            action: function(node) {
            },
            submenu: {
              elements: [
                {
                  text: "Simple Graph",
                  icon: "fab cm-all fa-hubspot",
                  action: function(node) {
                    v_connTabControl.tag.createGraphTab(node.text);
                    drawGraph(false, node.tree.tag.v_username);
                  }
                },
                {
                  text: "Complete Graph",
                  icon: "fab cm-all fa-hubspot",
                  action: function(node) {
                    v_connTabControl.tag.createGraphTab(node.text);
                    drawGraph(true, node.tree.tag.v_username);
                  }
                }
              ]
            }
          }
        ]
      },
      cm_tablespaces: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeOracle$1(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Tablespace",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate("Create Tablespace", node.tree.tag.create_tablespace);
            }
          }
        ]
      },
      cm_tablespace: {
        elements: [
          {
            text: "Alter Tablespace",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate("Alter Tablespace", node.tree.tag.alter_tablespace.replace("#tablespace_name#", node.text));
            }
          },
          {
            text: "Drop Tablespace",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate("Drop Tablespace", node.tree.tag.drop_tablespace.replace("#tablespace_name#", node.text));
            }
          }
        ]
      },
      cm_roles: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeOracle$1(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Role",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate("Create Role", node.tree.tag.create_role);
            }
          }
        ]
      },
      cm_role: {
        elements: [
          {
            text: "Alter Role",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate("Alter Role", node.tree.tag.alter_role.replace("#role_name#", node.text));
            }
          },
          {
            text: "Drop Role",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate("Drop Role", node.tree.tag.drop_role.replace("#role_name#", node.text));
            }
          }
        ]
      },
      cm_tables: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeOracle$1(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Table",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate("Create Table", node.tree.tag.create_table.replace("#schema_name#", node.tree.tag.v_username));
            }
          }
        ]
      },
      cm_table: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeOracle$1(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Data Actions",
            icon: "fas cm-all fa-list",
            submenu: {
              elements: [
                {
                  text: "Query Data",
                  icon: "fas cm-all fa-search",
                  action: function(node) {
                    TemplateSelectOracle(node.tree.tag.v_username, node.text);
                  }
                },
                {
                  text: "Edit Data",
                  icon: "fas cm-all fa-table",
                  action: function(node) {
                    v_startEditData(node.text, node.tree.tag.v_username);
                  }
                },
                {
                  text: "Insert Record",
                  icon: "fas cm-all fa-edit",
                  action: function(node) {
                    TemplateInsertOracle(node.tree.tag.v_username, node.text);
                  }
                },
                {
                  text: "Update Records",
                  icon: "fas cm-all fa-edit",
                  action: function(node) {
                    TemplateUpdateOracle(node.tree.tag.v_username, node.text);
                  }
                },
                {
                  text: "Delete Records",
                  icon: "fas cm-all fa-times",
                  action: function(node) {
                    tabSQLTemplate(
                      "Delete Records",
                      node.tree.tag.delete.replace("#table_name#", node.tree.tag.v_username + "." + node.text)
                    );
                  }
                }
              ]
            }
          },
          {
            text: "Table Actions",
            icon: "fas cm-all fa-list",
            submenu: {
              elements: [
                {
                  text: "Alter Table",
                  icon: "fas cm-all fa-table",
                  action: function(node) {
                    startAlterTable(true, "alter", node.text, node.tree.tag.v_username);
                  }
                },
                {
                  text: "Alter Table (SQL)",
                  icon: "fas cm-all fa-edit",
                  action: function(node) {
                    tabSQLTemplate(
                      "Alter Table",
                      node.tree.tag.alter_table.replace("#table_name#", node.tree.tag.v_username + "." + node.text)
                    );
                  }
                },
                {
                  text: "Drop Table",
                  icon: "fas cm-all fa-times",
                  action: function(node) {
                    tabSQLTemplate(
                      "Drop Table",
                      node.tree.tag.drop_table.replace("#table_name#", node.tree.tag.v_username + "." + node.text)
                    );
                  }
                }
              ]
            }
          }
        ]
      },
      cm_columns: {
        elements: [
          {
            text: "Create Column",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate(
                "Create Field",
                node.tree.tag.create_column.replace("#table_name#", node.tree.tag.v_username + "." + node.parent.text)
              );
            }
          }
        ]
      },
      cm_column: {
        elements: [
          {
            text: "Alter Column",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate(
                "Alter Column",
                node.tree.tag.alter_column.replace("#table_name#", node.tree.tag.v_username + "." + node.parent.parent.text).replace(/#column_name#/g, node.text)
              );
            }
          },
          {
            text: "Drop Column",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate(
                "Drop Column",
                node.tree.tag.drop_column.replace("#table_name#", node.tree.tag.v_username + "." + node.parent.parent.text).replace(/#column_name#/g, node.text)
              );
            }
          }
        ]
      },
      cm_pks: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeOracle$1(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Primary Key",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate(
                "Create Primary Key",
                node.tree.tag.create_primarykey.replace("#table_name#", node.tree.tag.v_username + "." + node.parent.text)
              );
            }
          }
        ]
      },
      cm_pk: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeOracle$1(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Drop Primary Key",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate(
                "Drop Primary Key",
                node.tree.tag.drop_primarykey.replace("#table_name#", node.tree.tag.v_username + "." + node.parent.parent.text).replace("#constraint_name#", node.text)
              );
            }
          }
        ]
      },
      cm_fks: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeOracle$1(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Foreign Key",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate(
                "Create Foreign Key",
                node.tree.tag.create_foreignkey.replace("#table_name#", node.tree.tag.v_username + "." + node.parent.text)
              );
            }
          }
        ]
      },
      cm_fk: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeOracle$1(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Drop Foreign Key",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate(
                "Drop Foreign Key",
                node.tree.tag.drop_foreignkey.replace("#table_name#", node.tree.tag.v_username + "." + node.parent.parent.text).replace("#constraint_name#", node.text)
              );
            }
          }
        ]
      },
      cm_uniques: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeOracle$1(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Unique",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate(
                "Create Unique",
                node.tree.tag.create_unique.replace("#table_name#", node.tree.tag.v_username + "." + node.parent.text)
              );
            }
          }
        ]
      },
      cm_unique: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeOracle$1(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Drop Unique",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate(
                "Drop Unique",
                node.tree.tag.drop_unique.replace("#table_name#", node.tree.tag.v_username + "." + node.parent.parent.text).replace("#constraint_name#", node.text)
              );
            }
          }
        ]
      },
      cm_indexes: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeOracle$1(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Index",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate(
                "Create Index",
                node.tree.tag.create_index.replace("#table_name#", node.tree.tag.v_username + "." + node.parent.text)
              );
            }
          }
        ]
      },
      cm_index: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeOracle$1(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Alter Index",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate(
                "Alter Index",
                node.tree.tag.alter_index.replace(
                  "#index_name#",
                  node.tree.tag.v_username + "." + node.text.replace(" (Unique)", "").replace(" (Non Unique)", "")
                )
              );
            }
          },
          {
            text: "Drop Index",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate(
                "Drop Index",
                node.tree.tag.drop_index.replace(
                  "#index_name#",
                  node.tree.tag.v_username + "." + node.text.replace(" (Unique)", "").replace(" (Non Unique)", "")
                )
              );
            }
          }
        ]
      },
      cm_sequences: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeOracle$1(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Sequence",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate(
                "Create Sequence",
                node.tree.tag.create_sequence.replace("#schema_name#", node.tree.tag.v_username)
              );
            }
          }
        ]
      },
      cm_sequence: {
        elements: [
          {
            text: "Alter Sequence",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate(
                "Alter Sequence",
                node.tree.tag.alter_sequence.replace("#sequence_name#", node.tree.tag.v_username + "." + node.text)
              );
            }
          },
          {
            text: "Drop Sequence",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate(
                "Drop Sequence",
                node.tree.tag.drop_sequence.replace("#sequence_name#", node.tree.tag.v_username + "." + node.text)
              );
            }
          }
        ]
      },
      cm_views: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeOracle$1(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create View",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate("Create View", node.tree.tag.create_view.replace("#schema_name#", node.tree.tag.v_username));
            }
          }
        ]
      },
      cm_view: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeOracle$1(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Query Data",
            icon: "fas cm-all fa-search",
            action: function(node) {
              var v_table_name = "";
              v_table_name = node.tree.tag.v_username + "." + node.text;
              v_connTabControl.tag.createQueryTab(node.text);
              v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(
                "-- Querying Data\nselect t.*\nfrom " + v_table_name + " t"
              );
              v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
              renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);
              querySQL(0);
            }
          },
          {
            text: "Edit View",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              v_connTabControl.tag.createQueryTab(node.text);
              getViewDefinitionOracle(node);
            }
          },
          {
            text: "Drop View",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate(
                "Drop View",
                node.tree.tag.drop_view.replace("#view_name#", node.tree.tag.v_username + "." + node.text)
              );
            }
          }
        ]
      },
      /*'cm_triggers': {
      	elements: [{
      		text: 'Refresh',
      		icon: 'fas cm-all fa-sync-alt',
      		action: function(node) {
      			if (node.childNodes == 0)
      				refreshTreeOracle(node);
      			else {
      				node.collapseNode();
      				node.expandNode();
      			}
      		},
      	}, {
      		text: 'Create Trigger',
      		icon: 'fas cm-all fa-edit',
      		action: function(node) {
      			tabSQLTemplate('Create Trigger', node.tree.tag
      				.create_trigger.replace(
      					'#table_name#', node.tree.tag.v_username + '.' + node.parent
      					.text));
      		}
      	}, {
      		text: 'Doc: Triggers',
      		icon: 'fas cm-all fa-globe-americas',
      		action: function(node) {
      			v_connTabControl.tag.createWebsiteTab(
      				'Documentation: Triggers',
      				'https://www.postgresql.org/docs/' +
      				getMajorVersionOracle(node.tree.tag.version) +
      				'/static/trigger-definition.html');
      		}
      	}]
      },
      'cm_view_triggers': {
      	elements: [{
      		text: 'Refresh',
      		icon: 'fas cm-all fa-sync-alt',
      		action: function(node) {
      			if (node.childNodes == 0)
      				refreshTreeOracle(node);
      			else {
      				node.collapseNode();
      				node.expandNode();
      			}
      		},
      	}, {
      		text: 'Create Trigger',
      		icon: 'fas cm-all fa-edit',
      		action: function(node) {
      			tabSQLTemplate('Create Trigger', node.tree.tag
      				.create_view_trigger.replace(
      					'#table_name#', node.tree.tag.v_username + '.' + node.parent
      					.text));
      		}
      	}, {
      		text: 'Doc: Triggers',
      		icon: 'fas cm-all fa-globe-americas',
      		action: function(node) {
      			v_connTabControl.tag.createWebsiteTab(
      				'Documentation: Triggers',
      				'https://www.postgresql.org/docs/' +
      				getMajorVersionOracle(node.tree.tag.version) +
      				'/static/trigger-definition.html');
      		}
      	}]
      },
      'cm_trigger': {
      	elements: [{
      		text: 'Alter Trigger',
      		icon: 'fas cm-all fa-edit',
      		action: function(node) {
      			tabSQLTemplate('Alter Trigger', node.tree.tag
      				.alter_trigger.replace(
      					'#table_name#', node.tree.tag.v_username + '.' +
      					node.parent.parent.text).replace(
      					'#trigger_name#', node.text));
      		}
      	}, {
      		text: 'Enable Trigger',
      		icon: 'fas cm-all fa-edit',
      		action: function(node) {
      			tabSQLTemplate('Enable Trigger', node.tree.tag
      				.enable_trigger.replace(
      					'#table_name#', node.tree.tag.v_username + '.' +
      					node.parent.parent.text).replace(
      					'#trigger_name#', node.text));
      		}
      	}, {
      		text: 'Disable Trigger',
      		icon: 'fas cm-all fa-edit',
      		action: function(node) {
      			tabSQLTemplate('Disable Trigger', node.tree
      				.tag.disable_trigger.replace(
      					'#table_name#', node.tree.tag.v_username + '.' +
      					node.parent.parent.text).replace(
      					'#trigger_name#', node.text));
      		}
      	}, {
      		text: 'Drop Trigger',
      		icon: 'fas cm-all fa-times',
      		action: function(node) {
      			tabSQLTemplate('Drop Trigger', node.tree.tag
      				.drop_trigger.replace(
      					'#table_name#', node.tree.tag.v_username + '.' +
      					node.parent.parent.text).replace(
      					'#trigger_name#', node.text));
      		}
      	}]
      },
      'cm_partitions': {
      	elements: [{
      		text: 'Refresh',
      		icon: 'fas cm-all fa-sync-alt',
      		action: function(node) {
      			if (node.childNodes == 0)
      				refreshTreeOracle(node);
      			else {
      				node.collapseNode();
      				node.expandNode();
      			}
      		}
      	}, {
      		text: 'Create Partition',
      		icon: 'fas cm-all fa-edit',
      		action: function(node) {
      			tabSQLTemplate('Create Partition', node.tree
      				.tag.create_partition.replace(
      					'#table_name#', node.tree.tag.v_username + '.' + node.parent
      					.text));
      		}
      	}, {
      		text: 'Doc: Partitions',
      		icon: 'fas cm-all fa-globe-americas',
      		action: function(node) {
      			v_connTabControl.tag.createWebsiteTab(
      				'Documentation: Partitions',
      				'https://www.postgresql.org/docs/' +
      				getMajorVersionOracle(node.tree.tag.version) +
      				'/static/ddl-partitioning.html');
      		}
      	}]
      },
      'cm_partition': {
      	elements: [{
      		text: 'No Inherit Partition',
      		icon: 'fas cm-all fa-edit',
      		action: function(node) {
      			tabSQLTemplate('No Inherit Partition', node
      				.tree.tag.noinherit_partition.replace(
      					'#table_name#', node.tree.tag.v_username + '.' +
      					node.parent.parent.text).replace(
      					'#partition_name#', node.text));
      		}
      	}, {
      		text: 'Drop Partition',
      		icon: 'fas cm-all fa-times',
      		action: function(node) {
      			tabSQLTemplate('Drop Partition', node.tree.tag
      				.drop_partition.replace(
      					'#partition_name#', node.text));
      		}
      	}]
      },*/
      cm_functions: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeOracle$1(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Function",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate(
                "Create Function",
                node.tree.tag.create_function.replace("#schema_name#", node.tree.tag.v_username)
              );
            }
          }
        ]
      },
      cm_function: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeOracle$1(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Edit Function",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              v_connTabControl.tag.createQueryTab(node.text);
              getFunctionDefinitionOracle(node);
            }
          },
          {
            text: "Drop Function",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate("Drop Function", node.tree.tag.drop_function.replace("#function_name#", node.tag.id));
            }
          }
        ]
      },
      cm_procedures: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeOracle$1(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Procedure",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate(
                "Create Procedure",
                node.tree.tag.create_procedure.replace("#schema_name#", node.tree.tag.v_username)
              );
            }
          }
        ]
      },
      cm_procedure: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeOracle$1(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Edit Procedure",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              v_connTabControl.tag.createQueryTab(node.text);
              getProcedureDefinitionOracle(node);
            }
          },
          {
            text: "Drop Procedure",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate("Drop Procedure", node.tree.tag.drop_procedure.replace("#function_name#", node.tag.id));
            }
          }
        ]
      },
      /*'cm_triggerfunctions': {
        			elements: [{
        				text: 'Refresh',
        				icon: 'fas cm-all fa-sync-alt',
        				action: function(node) {
        					if (node.childNodes == 0)
        						refreshTreeOracle(node);
        					else {
        						node.collapseNode();
        						node.expandNode();
        					}
        				}
        			}, {
        				text: 'Create Trigger Function',
        				icon: 'fas cm-all fa-edit',
        				action: function(node) {
        					tabSQLTemplate('Create Trigger Function',
        						node.tree.tag.create_triggerfunction
        						.replace('#schema_name#', node.tree.tag.v_username));
        				}
        			}, {
        				text: 'Doc: Trigger Functions',
        				icon: 'fas cm-all fa-globe-americas',
        				action: function(node) {
        					v_connTabControl.tag.createWebsiteTab(
        						'Documentation: Trigger Functions',
        						'https://www.postgresql.org/docs/' +
        						getMajorVersionOracle(node.tree.tag.version) +
        						'/static/plpgsql-trigger.html');
        				}
        			}]
        		},
        		'cm_triggerfunction': {
        			elements: [{
        				text: 'Refresh',
        				icon: 'fas cm-all fa-sync-alt',
        				action: function(node) {
        					if (node.childNodes == 0)
        						refreshTreeOracle(node);
        					else {
        						node.collapseNode();
        						node.expandNode();
        					}
        				}
        			}, {
        				text: 'Edit Trigger Function',
        				icon: 'fas cm-all fa-edit',
        				action: function(node) {
        					v_connTabControl.tag.createQueryTab(
        						node.text);
        					getTriggerFunctionDefinitionOracle(node);
        				}
        			}, {
        				text: 'Drop Trigger Function',
        				icon: 'fas cm-all fa-times',
        				action: function(node) {
        					tabSQLTemplate('Drop Trigger Function',
        						node.tree.tag.drop_triggerfunction.replace(
        							'#function_name#', node.tag.id)
        					);
        				}
        			}]
        		},
        		'cm_mviews': {
        			elements: [{
        				text: 'Refresh',
        				icon: 'fas cm-all fa-sync-alt',
        				action: function(node) {
        					if (node.childNodes == 0)
        						refreshTreeOracle(node);
        					else {
        						node.collapseNode();
        						node.expandNode();
        					}
        				}
        			}, {
        				text: 'Create Mat. View',
        				icon: 'fas cm-all fa-edit',
        				action: function(node) {
        					tabSQLTemplate('Create Materialized View',
        						node.tree.tag
        						.create_mview.replace(
        							'#schema_name#', node.tree.tag.v_username
        						));
        				}
        			}, {
        				text: 'Doc: Mat. Views',
        				icon: 'fas cm-all fa-globe-americas',
        				action: function(node) {
        					v_connTabControl.tag.createWebsiteTab(
        						'Documentation: Materialized Views',
        						'https://www.postgresql.org/docs/' +
        						getMajorVersionOracle(node.tree.tag.version) +
        						'/static/sql-creatematerializedview.html'
        					);
        				}
        			}]
        		},
        		'cm_mview': {
        			elements: [{
        				text: 'Refresh',
        				icon: 'fas cm-all fa-sync-alt',
        				action: function(node) {
        					if (node.childNodes == 0)
        						refreshTreeOracle(node);
        					else {
        						node.collapseNode();
        						node.expandNode();
        					}
        				}
        			}, {
        				text: 'Query Data',
        				icon: 'fas cm-all fa-search',
        				action: function(node) {
      
        					var v_table_name = '';
        					v_table_name = node.tree.tag.v_username + '.' + node.text;
      
        					v_connTabControl.tag.createQueryTab(
        						node.text);
      
        					v_connTabControl.selectedTab.tag.tabControl
        						.selectedTab.tag.sel_filtered_data.value =
        						1;
      
        					v_connTabControl.selectedTab.tag.tabControl
        						.selectedTab.tag.editor.setValue(
        							'-- Querying Data\nselect t.*\nfrom ' +
        							v_table_name + ' t');
        					v_connTabControl.selectedTab.tag.tabControl
        						.selectedTab.tag.editor.clearSelection();
        					renameTabConfirm(v_connTabControl.selectedTab
        						.tag.tabControl.selectedTab, node.text
        					);
      
        					//minimizeEditor();
      
        					querySQL(0);
        				}
        			}, {
        				text: 'Edit Mat. View',
        				icon: 'fas cm-all fa-edit',
        				action: function(node) {
        					v_connTabControl.tag.createQueryTab(
        						node.text);
        					getMaterializedViewDefinitionOracle(
        						node);
        				}
        			}, {
        				text: 'Refresh Mat. View',
        				icon: 'fas cm-all fa-edit',
        				action: function(node) {
        					tabSQLTemplate('Refresh Materialized View',
        						node.tree.tag.refresh_mview
        						.replace('#view_name#', node.tree.tag.v_username + '.' + node.text)
        					);
        				}
        			}, {
        				text: 'Drop Mat. View',
        				icon: 'fas cm-all fa-times',
        				action: function(node) {
        					tabSQLTemplate('Drop Materialized View',
        						node.tree.tag.drop_mview
        						.replace('#view_name#', node.tree.tag.v_username + '.' + node.text)
        					);
        				}
        			}]
        		},*/
      cm_refresh: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeOracle$1(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          }
        ]
      }
    };
    var tree = createTree(p_div, "#fcfdfd", context_menu);
    v_connTabControl.selectedTab.tag.tree = tree;
    let v_autocomplete_switch_status = v_connTabControl.selectedTab.tag.enable_autocomplete !== false ? " checked " : "";
    v_connTabControl.selectedTab.tag.divDetails.innerHTML = '<i class="fas fa-server me-1"></i>selected DB: <b>' + escapeHtml(v_connTabControl.selectedTab.tag.selectedDatabase) + '</b><div class="omnidb__switch omnidb__switch--sm float-end" data-bs-toggle="tooltip" data-bs-placement="bottom" data-bs-html="true" title="" data-bs-original-title="<h5>Toggle autocomplete.</h5><div>Switch OFF <b>disables the autocomplete</b> on the inner tabs for this connection.</div>"><input type="checkbox" ' + v_autocomplete_switch_status + ' id="autocomplete_toggler_' + v_connTabControl.selectedTab.tag.tab_id + `" class="omnidb__switch--input" onchange="toggleConnectionAutocomplete('autocomplete_toggler_` + v_connTabControl.selectedTab.tag.tab_id + `')"><label for="autocomplete_toggler_` + v_connTabControl.selectedTab.tag.tab_id + '" class="omnidb__switch--label"><span><i class="fas fa-spell-check"></i></span></label></div>';
    tree.nodeAfterOpenEvent = function(node) {
      refreshTreeOracle$1(node);
    };
    tree.clickNodeEvent = function(node) {
      if (v_connTabControl.selectedTab.tag.treeTabsVisible) {
        getPropertiesOracle(node);
      }
    };
    tree.beforeContextMenuEvent = function(node, callback) {
      var v_elements = [];
      if (v_connTabControl.tag.hooks.oracleTreeContextMenu.length > 0) {
        for (var i2 = 0; i2 < v_connTabControl.tag.hooks.oracleTreeContextMenu.length; i2++)
          v_elements = v_elements.concat(v_connTabControl.tag.hooks.oracleTreeContextMenu[i2](node));
      }
      var v_customCallback = function() {
        callback(v_elements);
      };
      v_customCallback();
    };
    var node_server = tree.createNode(
      "Oracle",
      false,
      "node-oracle",
      null,
      {
        type: "server"
      },
      "cm_server"
    );
    node_server.createChildNode("", true, "node-spin", null, null);
    tree.drawTree();
  }
  function getPropertiesOracle(node) {
    if (node.tag != void 0)
      if (node.tag.type == "role") {
        getProperties("/get_properties_oracle/", {
          p_schema: null,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "tablespace") {
        getProperties("/get_properties_oracle/", {
          p_schema: null,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "table") {
        getProperties("/get_properties_oracle/", {
          p_schema: null,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "sequence") {
        getProperties("/get_properties_oracle/", {
          p_schema: null,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "view") {
        getProperties("/get_properties_oracle/", {
          p_schema: null,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "mview") {
        getProperties("/get_properties_oracle/", {
          p_schema: null,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "function") {
        getProperties("/get_properties_oracle/", {
          p_schema: null,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "procedure") {
        getProperties("/get_properties_oracle/", {
          p_schema: null,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "trigger") {
        getProperties("/get_properties_oracle/", {
          p_schema: null,
          p_table: node.parent.parent.text,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "triggerfunction") {
        getProperties("/get_properties_oracle/", {
          p_schema: null,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else {
        clearProperties();
      }
    if (v_connTabControl.tag.hooks.oracleTreeNodeClick.length > 0) {
      for (var i2 = 0; i2 < v_connTabControl.tag.hooks.oracleTreeNodeClick.length; i2++)
        v_connTabControl.tag.hooks.oracleTreeNodeClick[i2](node);
    }
  }
  function refreshTreeOracle$1(node) {
    if (node.tag != void 0)
      if (node.tag.type == "table_list") {
        getTablesOracle(node);
      } else if (node.tag.type == "table") {
        getColumnsOracle(node);
      } else if (node.tag.type == "primary_key") {
        getPKOracle(node);
      } else if (node.tag.type == "pk") {
        getPKColumnsOracle(node);
      } else if (node.tag.type == "uniques") {
        getUniquesOracle(node);
      } else if (node.tag.type == "unique") {
        getUniquesColumnsOracle(node);
      } else if (node.tag.type == "foreign_keys") {
        getFKsOracle(node);
      } else if (node.tag.type == "foreign_key") {
        getFKsColumnsOracle(node);
      } else if (node.tag.type == "view_list") {
        getViewsOracle(node);
      } else if (node.tag.type == "view") {
        getViewsColumnsOracle(node);
      } else if (node.tag.type == "indexes") {
        getIndexesOracle(node);
      } else if (node.tag.type == "index") {
        getIndexesColumnsOracle(node);
      } else if (node.tag.type == "function_list") {
        getFunctionsOracle(node);
      } else if (node.tag.type == "function") {
        getFunctionFieldsOracle(node);
      } else if (node.tag.type == "procedure_list") {
        getProceduresOracle(node);
      } else if (node.tag.type == "procedure") {
        getProcedureFieldsOracle(node);
      } else if (node.tag.type == "sequence_list") {
        getSequencesOracle(node);
      } else if (node.tag.type == "tablespace_list") {
        getTablespacesOracle(node);
      } else if (node.tag.type == "role_list") {
        getRolesOracle(node);
      } else if (node.tag.type == "server") {
        getTreeDetailsOracle(node);
      } else {
        afterNodeOpenedCallbackOracle(node);
      }
  }
  function afterNodeOpenedCallbackOracle(node) {
    if (v_connTabControl.tag.hooks.oracleTreeNodeOpen.length > 0) {
      for (var i2 = 0; i2 < v_connTabControl.tag.hooks.oracleTreeNodeOpen.length; i2++)
        v_connTabControl.tag.hooks.oracleTreeNodeOpen[i2](node);
    }
  }
  function getTreeDetailsOracle(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_tree_info_oracle/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id
      }),
      function(p_return) {
        node.tree.contextMenu.cm_server.elements = [];
        node.tree.contextMenu.cm_server.elements.push({
          text: "Refresh",
          icon: "fas cm-all fa-sync-alt",
          action: function(node2) {
            if (node2.childNodes == 0) refreshTreeOracle$1(node2);
            else {
              node2.collapseNode();
              node2.expandNode();
            }
          }
        });
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.tree.tag = {
          version: p_return.v_data.v_database_return.version,
          v_username: p_return.v_data.v_database_return.v_username,
          superuser: p_return.v_data.v_database_return.superuser,
          express: p_return.v_data.v_database_return.express,
          create_role: p_return.v_data.v_database_return.create_role,
          alter_role: p_return.v_data.v_database_return.alter_role,
          drop_role: p_return.v_data.v_database_return.drop_role,
          create_tablespace: p_return.v_data.v_database_return.create_tablespace,
          alter_tablespace: p_return.v_data.v_database_return.alter_tablespace,
          drop_tablespace: p_return.v_data.v_database_return.drop_tablespace,
          create_sequence: p_return.v_data.v_database_return.create_sequence,
          alter_sequence: p_return.v_data.v_database_return.alter_sequence,
          drop_sequence: p_return.v_data.v_database_return.drop_sequence,
          create_function: p_return.v_data.v_database_return.create_function,
          drop_function: p_return.v_data.v_database_return.drop_function,
          create_procedure: p_return.v_data.v_database_return.create_procedure,
          drop_procedure: p_return.v_data.v_database_return.drop_procedure,
          //create_triggerfunction: p_return.v_data.v_database_return
          //    .create_triggerfunction,
          //drop_triggerfunction: p_return.v_data.v_database_return
          //    .drop_triggerfunction,
          create_view: p_return.v_data.v_database_return.create_view,
          drop_view: p_return.v_data.v_database_return.drop_view,
          //create_mview: p_return.v_data.v_database_return.create_mview,
          //refresh_mview: p_return.v_data.v_database_return.refresh_mview,
          //drop_mview: p_return.v_data.v_database_return.drop_mview,
          create_table: p_return.v_data.v_database_return.create_table,
          alter_table: p_return.v_data.v_database_return.alter_table,
          drop_table: p_return.v_data.v_database_return.drop_table,
          create_column: p_return.v_data.v_database_return.create_column,
          alter_column: p_return.v_data.v_database_return.alter_column,
          drop_column: p_return.v_data.v_database_return.drop_column,
          create_primarykey: p_return.v_data.v_database_return.create_primarykey,
          drop_primarykey: p_return.v_data.v_database_return.drop_primarykey,
          create_unique: p_return.v_data.v_database_return.create_unique,
          drop_unique: p_return.v_data.v_database_return.drop_unique,
          create_foreignkey: p_return.v_data.v_database_return.create_foreignkey,
          drop_foreignkey: p_return.v_data.v_database_return.drop_foreignkey,
          create_index: p_return.v_data.v_database_return.create_index,
          alter_index: p_return.v_data.v_database_return.alter_index,
          drop_index: p_return.v_data.v_database_return.drop_index,
          //create_trigger: p_return.v_data.v_database_return.create_trigger,
          //create_view_trigger: p_return.v_data.v_database_return.create_view_trigger,
          //alter_trigger: p_return.v_data.v_database_return.alter_trigger,
          //enable_trigger: p_return.v_data.v_database_return.enable_trigger,
          //disable_trigger: p_return.v_data.v_database_return.disable_trigger,
          //drop_trigger: p_return.v_data.v_database_return.drop_trigger,
          //create_partition: p_return.v_data.v_database_return.create_partition,
          //noinherit_partition: p_return.v_data.v_database_return.noinherit_partition,
          //drop_partition: p_return.v_data.v_database_return.drop_partition
          delete: p_return.v_data.v_database_return.delete
        };
        if (node.tree.tag.superuser) {
          node.tree.contextMenu.cm_server.elements.push({
            text: "Monitoring",
            icon: "fas cm-all fa-chart-line",
            action: function(node2) {
            },
            submenu: {
              elements: [
                /*{
                	text: 'Dashboard',
                	icon: 'fas cm-all fa-chart-line',
                	action: function(node) {
                		v_connTabControl.tag.createMonitorDashboardTab();
                		startMonitorDashboard();
                	}
                }, */
                {
                  text: "Sessions",
                  icon: "fas cm-all fa-chart-line",
                  action: function(node2) {
                    v_connTabControl.tag.createMonitoringTab("Sessions", "select * from v$session", [
                      {
                        icon: "fas cm-all fa-times",
                        title: "Terminate",
                        action: "oracleTerminateBackend"
                      }
                    ]);
                  }
                }
              ]
            }
          });
        }
        node.setText(p_return.v_data.v_database_return.version);
        var node_connection = node.createChildNode(
          p_return.v_data.v_database_return.v_database,
          true,
          "fas node-all fa-database node-database-list",
          {
            type: "connection"
          },
          "cm_connection"
        );
        if (node.tree.tag.superuser) {
          var node_tablespaces = node.createChildNode(
            "Tablespaces",
            false,
            "fas node-all fa-folder-open node-tablespace-list",
            {
              type: "tablespace_list",
              num_tablespaces: 0
            },
            "cm_tablespaces"
          );
          node_tablespaces.createChildNode("", true, "node-spin", null, null);
          var node_roles = node.createChildNode(
            "Roles",
            false,
            "fas node-all fa-users node-user-list",
            {
              type: "role_list",
              num_roles: 0
            },
            "cm_roles"
          );
          node_roles.createChildNode("", true, "node-spin", null, null);
        }
        var node_tables = node_connection.createChildNode(
          "Tables",
          false,
          "fas node-all fa-th node-table-list",
          {
            type: "table_list",
            num_tables: 0
          },
          "cm_tables"
        );
        node_tables.createChildNode("", true, "node-spin", null, null);
        var node_sequences = node_connection.createChildNode(
          "Sequences",
          false,
          "fas node-all fa-sort-numeric-down node-sequence-list",
          {
            type: "sequence_list",
            num_sequences: 0
          },
          "cm_sequences"
        );
        node_sequences.createChildNode("", true, "node-spin", null, null);
        var node_views = node_connection.createChildNode(
          "Views",
          false,
          "fas node-all fa-eye node-view-list",
          {
            type: "view_list",
            num_views: 0
          },
          "cm_views"
        );
        node_views.createChildNode("", true, "node-spin", null, null);
        var node_functions = node_connection.createChildNode(
          "Functions",
          false,
          "fas node-all fa-cog node-function-list",
          {
            type: "function_list",
            num_functions: 0
          },
          "cm_functions"
        );
        node_functions.createChildNode("", true, "node-spin", null, null);
        var node_functions = node_connection.createChildNode(
          "Procedures",
          false,
          "fas node-all fa-cog node-procedure-list",
          {
            type: "procedure_list",
            num_functions: 0
          },
          "cm_procedures"
        );
        node_functions.createChildNode("", true, "node-spin", null, null);
        if (v_connTabControl.selectedTab.tag.firstTimeOpen) {
          v_connTabControl.selectedTab.tag.firstTimeOpen = false;
        }
        afterNodeOpenedCallbackOracle(node);
      },
      function(p_return) {
        nodeOpenErrorOracle(p_return, node);
      },
      "box",
      false
    );
  }
  function getTablespacesOracle(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_tablespaces_oracle/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Tablespaces (" + p_return.v_data.length + ")");
        node.tag.num_tablespaces = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-folder node-tablespace",
            {
              type: "tablespace"
            },
            "cm_tablespace",
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackOracle(node);
      },
      function(p_return) {
        nodeOpenErrorOracle(p_return, node);
      },
      "box",
      false
    );
  }
  function getRolesOracle(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_roles_oracle/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Roles (" + p_return.v_data.length + ")");
        node.tag.num_tablespaces = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-user node-user",
            {
              type: "role"
            },
            "cm_role",
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackOracle(node);
      },
      function(p_return) {
        nodeOpenErrorOracle(p_return, node);
      },
      "box",
      false
    );
  }
  function getTablesOracle(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_tables_oracle/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: null
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Tables (" + p_return.v_data.length + ")");
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-table node-table",
            {
              type: "table",
              has_primary_keys: p_return.v_data[i].v_has_primary_keys,
              has_foreign_keys: p_return.v_data[i].v_has_foreign_keys,
              has_uniques: p_return.v_data[i].v_has_uniques,
              has_indexes: p_return.v_data[i].v_has_indexes,
              has_checks: p_return.v_data[i].v_has_checks,
              has_excludes: p_return.v_data[i].v_has_excludes,
              has_rules: p_return.v_data[i].v_has_rules,
              has_triggers: p_return.v_data[i].v_has_triggers,
              has_partitions: p_return.v_data[i].v_has_partitions,
              has_statistics: p_return.v_data[i].v_has_statistics
            },
            "cm_table",
            null,
            false
          );
          v_node.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "table_field"
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackOracle(node);
      },
      function(p_return) {
        nodeOpenErrorOracle(p_return, node);
      },
      "box",
      false
    );
  }
  function getSequencesOracle(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_sequences_oracle/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: null
      }),
      function(p_return) {
        node.setText("Sequences (" + p_return.v_data.length + ")");
        node.tag.num_tables = p_return.v_data.length;
        if (node.childNodes.length > 0) node.removeChildNodes();
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_sequence_name,
            false,
            "fas node-all fa-sort-numeric-down node-sequence",
            {
              type: "sequence"
            },
            "cm_sequence",
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackOracle(node);
      },
      function(p_return) {
        nodeOpenErrorOracle(p_return, node);
      },
      "box",
      false
    );
  }
  function getViewsOracle(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_views_oracle/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: null
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Views (" + p_return.v_data.length + ")");
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-eye node-view",
            {
              type: "view",
              has_triggers: p_return.v_data[i].v_has_triggers
            },
            "cm_view",
            null,
            false
          );
          v_node.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "view_field"
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackOracle(node);
      },
      function(p_return) {
        nodeOpenErrorOracle(p_return, node);
      },
      "box",
      false
    );
  }
  function getViewsColumnsOracle(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_views_columns_oracle/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.text,
        p_schema: null
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        v_list = node.createChildNode(
          "Columns (" + p_return.v_data.length + ")",
          false,
          "fas node-all fa-columns node-column",
          null,
          null,
          null,
          false
        );
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = v_list.createChildNode(
            p_return.v_data[i].v_column_name,
            false,
            "fas node-all fa-columns node-column",
            {
              type: "table_field"
            },
            null,
            null,
            false
          );
          v_node.createChildNode(
            "Type: " + p_return.v_data[i].v_data_type,
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            null,
            null,
            null,
            false
          );
        }
        if (node.tag.has_rules) {
          v_node = node.createChildNode(
            "Rules",
            false,
            "fas node-all fa-lightbulb node-rule",
            {
              type: "rule_list"
            },
            "cm_rules",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_triggers) {
          v_node = node.createChildNode(
            "Triggers",
            false,
            "fas node-all fa-bolt node-trigger",
            {
              type: "trigger_list"
            },
            "cm_view_triggers",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackOracle(node);
      },
      function(p_return) {
        nodeOpenErrorOracle(p_return, node);
      },
      "box",
      false
    );
  }
  function getViewDefinitionOracle(node) {
    execAjax(
      "/get_view_definition_oracle/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_view: node.text,
        p_schema: null
      }),
      function(p_return) {
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data);
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
        renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);
        var v_div_result = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;
        if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht != null) {
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht.destroy();
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht = null;
        }
        v_div_result.innerHTML = "";
        maximizeEditor();
      },
      function(p_return) {
        nodeOpenErrorOracle(p_return, node);
      },
      "box",
      true
    );
  }
  function getColumnsOracle(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_columns_oracle/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.text,
        p_schema: null
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        v_list = node.createChildNode(
          "Columns (" + p_return.v_data.length + ")",
          false,
          "fas node-all fa-columns node-column",
          {
            type: "column_list"
          },
          "cm_columns",
          null,
          false
        );
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = v_list.createChildNode(
            p_return.v_data[i].v_column_name,
            false,
            "fas node-all fa-columns node-column",
            {
              type: "table_field"
            },
            "cm_column",
            null,
            false
          );
          v_node.createChildNode(
            "Type: " + p_return.v_data[i].v_data_type,
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            null,
            null,
            null,
            false
          );
          v_node.createChildNode(
            "Nullable: " + p_return.v_data[i].v_nullable,
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            null,
            null,
            null,
            false
          );
        }
        if (node.tag.has_primary_keys) {
          v_node = node.createChildNode(
            "Primary Key",
            false,
            "fas node-all fa-key node-pkey",
            {
              type: "primary_key"
            },
            "cm_pks",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_foreign_keys) {
          v_node = node.createChildNode(
            "Foreign Keys",
            false,
            "fas node-all fa-key node-fkey",
            {
              type: "foreign_keys"
            },
            "cm_fks",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_uniques) {
          v_node = node.createChildNode(
            "Uniques",
            false,
            "fas node-all fa-key node-unique",
            {
              type: "uniques"
            },
            "cm_uniques",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_indexes) {
          v_node = node.createChildNode(
            "Indexes",
            false,
            "fas node-all fa-thumbtack node-index",
            {
              type: "indexes"
            },
            "cm_indexes",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_triggers) {
          v_node = node.createChildNode(
            "Triggers",
            false,
            "fas node-all fa-bolt node-trigger",
            {
              type: "trigger_list"
            },
            "cm_triggers",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_partitions) {
          v_node = node.createChildNode(
            "Partitions",
            false,
            "fas node-all fa-table node-partition",
            {
              type: "partition_list"
            },
            "cm_partitions",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackOracle(node);
      },
      function(p_return) {
        nodeOpenErrorOracle(p_return, node);
      },
      "box",
      false
    );
  }
  function getPKOracle(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_pk_oracle/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.text,
        p_schema: null
      }),
      function(p_return) {
        node.setText("Primary Key (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) {
          node.removeChildNodes();
        }
        if (p_return.v_data.length > 0) {
          v_node = node.createChildNode(
            p_return.v_data[0][0],
            false,
            "fas node-all fa-key node-pkey",
            {
              type: "pk"
            },
            "cm_pk"
          );
          v_node.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "pk_field"
            },
            null
          );
        }
        afterNodeOpenedCallbackOracle(node);
      },
      function(p_return) {
        nodeOpenErrorOracle(p_return, node);
      },
      "box",
      false
    );
  }
  function getPKColumnsOracle(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_pk_columns_oracle/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_key: node.text,
        p_table: node.parent.parent.text,
        p_schema: null
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node.createChildNode(
            p_return.v_data[i][0],
            false,
            "fas node-all fa-columns node-column",
            null,
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackOracle(node);
      },
      function(p_return) {
        nodeOpenErrorOracle(p_return, node);
      },
      "box",
      false
    );
  }
  function getUniquesOracle(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_uniques_oracle/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.text,
        p_schema: null
      }),
      function(p_return) {
        node.setText("Uniques (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) node.removeChildNodes();
        if (p_return.v_data.length > 0) {
          for (i = 0; i < p_return.v_data.length; i++) {
            v_node = node.createChildNode(
              p_return.v_data[i][0],
              false,
              "fas node-all fa-key node-unique",
              {
                type: "unique"
              },
              "cm_unique",
              null,
              false
            );
            v_node.createChildNode(
              "",
              false,
              "node-spin",
              {
                type: "unique_field"
              },
              null,
              null,
              false
            );
          }
          node.drawChildNodes();
        }
        afterNodeOpenedCallbackOracle(node);
      },
      function(p_return) {
        nodeOpenErrorOracle(p_return, node);
      },
      "box",
      false
    );
  }
  function getUniquesColumnsOracle(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_uniques_columns_oracle/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_unique: node.text,
        p_table: node.parent.parent.text,
        p_schema: null
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        if (p_return.v_data.length > 0) {
          for (i = 0; i < p_return.v_data.length; i++) {
            node.createChildNode(
              p_return.v_data[i][0],
              false,
              "fas node-all fa-columns node-column",
              null,
              null,
              null,
              false
            );
          }
          node.drawChildNodes();
        }
        afterNodeOpenedCallbackOracle(node);
      },
      function(p_return) {
        nodeOpenErrorOracle(p_return, node);
      },
      "box",
      false
    );
  }
  function getIndexesOracle(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_indexes_oracle/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.text,
        p_schema: null
      }),
      function(p_return) {
        node.setText("Indexes (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) node.removeChildNodes();
        var v_node2;
        if (p_return.v_data.length > 0) {
          for (i = 0; i < p_return.v_data.length; i++) {
            v_node2 = node.createChildNode(
              p_return.v_data[i][0] + " (" + p_return.v_data[i][1] + ")",
              false,
              "fas node-all fa-thumbtack node-index",
              {
                type: "index"
              },
              "cm_index",
              null,
              false
            );
            v_node2.createChildNode(
              "",
              false,
              "node-spin",
              {
                type: "index_field"
              },
              null,
              null,
              false
            );
          }
          node.drawChildNodes();
        }
        afterNodeOpenedCallbackOracle(node);
      },
      function(p_return) {
        nodeOpenErrorOracle(p_return, node);
      },
      "box",
      false
    );
  }
  function getIndexesColumnsOracle(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_indexes_columns_oracle/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_index: node.text.replace(" (Non Unique)", "").replace(" (Unique)", ""),
        p_table: node.parent.parent.text,
        p_schema: null
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        if (p_return.v_data.length > 0) {
          for (i = 0; i < p_return.v_data.length; i++) {
            node.createChildNode(
              p_return.v_data[i][0],
              false,
              "fas node-all fa-columns node-column",
              null,
              null,
              null,
              false
            );
          }
          node.drawChildNodes();
        }
        afterNodeOpenedCallbackOracle(node);
      },
      function(p_return) {
        nodeOpenErrorOracle(p_return, node);
      },
      "box",
      false
    );
  }
  function getFKsOracle(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_fks_oracle/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.text,
        p_schema: null
      }),
      function(p_return) {
        node.setText("Foreign Keys (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) node.removeChildNodes();
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i][0],
            false,
            "fas node-all fa-key node-fkey",
            {
              type: "foreign_key"
            },
            "cm_fk",
            null,
            false
          );
          v_node.createChildNode(
            "Referenced Table: " + p_return.v_data[i][1],
            false,
            "fas node-all fa-table node-table",
            null,
            null,
            null,
            false
          );
          v_node.createChildNode(
            "Delete Rule: " + p_return.v_data[i][2],
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            null,
            null,
            null,
            false
          );
          v_node.createChildNode(
            "Update Rule: " + p_return.v_data[i][3],
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            null,
            null,
            null,
            false
          );
          v_curr_fk = p_return.v_data[i][0];
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackOracle(node);
      },
      function(p_return) {
        nodeOpenErrorOracle(p_return, node);
      },
      "box",
      false
    );
  }
  function getFKsColumnsOracle(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_fks_columns_oracle/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_fkey: node.text,
        p_table: node.parent.parent.text,
        p_schema: null
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.createChildNode(
          "Referenced Table: " + p_return.v_data[0][0],
          false,
          "fas node-all fa-table node-table",
          null,
          null,
          null,
          false
        );
        node.createChildNode(
          "Delete Rule: " + p_return.v_data[0][1],
          false,
          "fas node-all fa-ellipsis-h node-bullet",
          null,
          null,
          null,
          false
        );
        node.createChildNode(
          "Update Rule: " + p_return.v_data[0][2],
          false,
          "fas node-all fa-ellipsis-h node-bullet",
          null,
          null,
          null,
          false
        );
        for (i = 0; i < p_return.v_data.length; i++) {
          node.createChildNode(
            p_return.v_data[i][3] + " <i class='fas node-all fa-arrow-right'></i> " + p_return.v_data[i][4],
            false,
            "fas node-all fa-columns node-column",
            null,
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackOracle(node);
      },
      function(p_return) {
        nodeOpenErrorOracle(p_return, node);
      },
      "box",
      false
    );
  }
  function getFunctionsOracle(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_functions_oracle/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: null
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Functions (" + p_return.v_data.length + ")");
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-cog node-function",
            {
              type: "function",
              id: p_return.v_data[i].v_id
            },
            "cm_function",
            null,
            false
          );
          v_node.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "function_field"
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackOracle(node);
      },
      function(p_return) {
        nodeOpenErrorOracle(p_return, node);
      },
      "box",
      false
    );
  }
  function getFunctionFieldsOracle(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_function_fields_oracle/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_function: node.tag.id,
        p_schema: null
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          if (p_return.v_data[i].v_type == "O")
            v_node = node.createChildNode(
              p_return.v_data[i].v_name,
              false,
              "fas node-all fa-arrow-right node-function-field",
              null,
              null,
              null,
              false
            );
          else {
            if (p_return.v_data[i].v_type == "I")
              v_node = node.createChildNode(
                p_return.v_data[i].v_name,
                false,
                "fas node-all fa-arrow-left node-function-field",
                null,
                null,
                null,
                false
              );
            else
              v_node = node.createChildNode(
                p_return.v_data[i].v_name,
                false,
                "fas node-all fa-exchange-alt node-function-field",
                null,
                null,
                null,
                false
              );
          }
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackOracle(node);
      },
      function(p_return) {
        nodeOpenErrorOracle(p_return, node);
      },
      "box",
      false
    );
  }
  function getFunctionDefinitionOracle(node) {
    execAjax(
      "/get_function_definition_oracle/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_function: node.tag.id
      }),
      function(p_return) {
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data);
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
        renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);
        var v_div_result = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;
        if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht != null) {
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht.destroy();
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht = null;
        }
        v_div_result.innerHTML = "";
        maximizeEditor();
      },
      function(p_return) {
        nodeOpenErrorOracle(p_return, node);
      },
      "box",
      true
    );
  }
  function getProceduresOracle(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_procedures_oracle/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: null
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Procedures (" + p_return.v_data.length + ")");
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-cog node-procedure",
            {
              type: "procedure",
              id: p_return.v_data[i].v_id
            },
            "cm_procedure",
            null,
            false
          );
          v_node.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "procedure_field"
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackOracle(node);
      },
      function(p_return) {
        nodeOpenErrorOracle(p_return, node);
      },
      "box",
      false
    );
  }
  function getProcedureFieldsOracle(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_procedure_fields_oracle/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_procedure: node.tag.id,
        p_schema: null
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          if (p_return.v_data[i].v_type == "O")
            v_node = node.createChildNode(
              p_return.v_data[i].v_name,
              false,
              "fas node-all fa-arrow-right node-function-field",
              null,
              null,
              null,
              false
            );
          else {
            if (p_return.v_data[i].v_type == "I")
              v_node = node.createChildNode(
                p_return.v_data[i].v_name,
                false,
                "fas node-all fa-arrow-left node-function-field",
                null,
                null,
                null,
                false
              );
            else
              v_node = node.createChildNode(
                p_return.v_data[i].v_name,
                false,
                "fas node-all fa-exchange-alt node-function-field",
                null,
                null,
                null,
                false
              );
          }
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackOracle(node);
      },
      function(p_return) {
        nodeOpenErrorOracle(p_return, node);
      },
      "box",
      false
    );
  }
  function getProcedureDefinitionOracle(node) {
    execAjax(
      "/get_procedure_definition_oracle/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_procedure: node.tag.id
      }),
      function(p_return) {
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data);
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
        renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);
        var v_div_result = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;
        if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht != null) {
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht.destroy();
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht = null;
        }
        v_div_result.innerHTML = "";
        maximizeEditor();
      },
      function(p_return) {
        nodeOpenErrorOracle(p_return, node);
      },
      "box",
      true
    );
  }
  function TemplateSelectOracle(p_schema, p_table) {
    execAjax(
      "/template_select_oracle/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table,
        p_schema
      }),
      function(p_return) {
        v_connTabControl.tag.createQueryTab(p_schema + "." + p_table);
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data.v_template);
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
        renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, p_schema + "." + p_table);
        querySQL(0);
      },
      function(p_return) {
        showError(p_return.v_data);
        return "";
      },
      "box",
      true
    );
  }
  function TemplateInsertOracle(p_schema, p_table) {
    execAjax(
      "/template_insert_oracle/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table,
        p_schema
      }),
      function(p_return) {
        tabSQLTemplate("Insert " + p_schema + "." + p_table, p_return.v_data.v_template);
      },
      function(p_return) {
        showError(p_return.v_data);
        return "";
      },
      "box",
      true
    );
  }
  function TemplateUpdateOracle(p_schema, p_table) {
    execAjax(
      "/template_update_oracle/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table,
        p_schema
      }),
      function(p_return) {
        tabSQLTemplate("Update " + p_schema + "." + p_table, p_return.v_data.v_template);
      },
      function(p_return) {
        showError(p_return.v_data);
        return "";
      },
      "box",
      true
    );
  }
  function nodeOpenErrorOracle(p_return, p_node) {
    if (p_return.v_data.password_timeout) {
      p_node.collapseNode();
      showPasswordPrompt(
        v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        function() {
          p_node.expandNode();
        },
        null,
        p_return.v_data.message
      );
    } else {
      if (p_node.childNodes.length > 0) p_node.removeChildNodes();
      v_node = p_node.createChildNode(
        "Error - <a class='a_link' onclick='showError(&quot;" + p_return.v_data.replace(/\n/g, "<br/>").replace(/"/g, "") + "&quot;)'>View Detail</a>",
        false,
        "fas fa-times node-error",
        {
          type: "error",
          message: p_return.v_data
        },
        null
      );
    }
  }
  function oracleTerminateBackendConfirm(p_pid) {
    execAjax(
      "/kill_backend_oracle/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_pid
      }),
      function(p_return) {
        refreshMonitoring();
      },
      function(p_return) {
        if (p_return.v_data.password_timeout) {
          showPasswordPrompt(
            v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
            function() {
              oracleTerminateBackendConfirm(p_pid);
            },
            null,
            p_return.v_data.message
          );
        } else {
          showError(p_return.v_data);
        }
      },
      "box",
      true
    );
  }
  function oracleTerminateBackend(p_row) {
    var v_pid = p_row[1] + "," + p_row[2];
    showConfirm("Are you sure you want to terminate session " + v_pid + "?", function() {
      oracleTerminateBackendConfirm(v_pid);
    });
  }
  const treeOracle = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    TemplateInsertOracle,
    TemplateSelectOracle,
    TemplateUpdateOracle,
    afterNodeOpenedCallbackOracle,
    getColumnsOracle,
    getFKsColumnsOracle,
    getFKsOracle,
    getFunctionDefinitionOracle,
    getFunctionFieldsOracle,
    getFunctionsOracle,
    getIndexesColumnsOracle,
    getIndexesOracle,
    getPKColumnsOracle,
    getPKOracle,
    getProcedureDefinitionOracle,
    getProcedureFieldsOracle,
    getProceduresOracle,
    getPropertiesOracle,
    getRolesOracle,
    getSequencesOracle,
    getTablesOracle,
    getTablespacesOracle,
    getTreeDetailsOracle,
    getTreeOracle,
    getUniquesColumnsOracle,
    getUniquesOracle,
    getViewDefinitionOracle,
    getViewsColumnsOracle,
    getViewsOracle,
    nodeOpenErrorOracle,
    oracleTerminateBackend,
    oracleTerminateBackendConfirm,
    refreshTreeOracle: refreshTreeOracle$1
  }, Symbol.toStringTag, { value: "Module" }));
  function getTreeMariadb(p_div) {
    var context_menu = {
      cm_server: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMariadb(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          }
        ]
      },
      cm_databases: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMariadb(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Database",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate("Create Database", node.tree.tag.create_database);
            }
          }
        ]
      },
      cm_database: {
        elements: [
          {
            text: "Render Graph",
            icon: "fab cm-all fa-hubspot",
            action: function(node) {
            },
            submenu: {
              elements: [
                {
                  text: "Simple Graph",
                  icon: "fab cm-all fa-hubspot",
                  action: function(node) {
                    v_connTabControl.tag.createGraphTab(node.text);
                    drawGraph(false, node.text);
                  }
                },
                {
                  text: "Complete Graph",
                  icon: "fab cm-all fa-hubspot",
                  action: function(node) {
                    v_connTabControl.tag.createGraphTab(node.text);
                    drawGraph(true, node.text);
                  }
                }
              ]
            }
          },
          {
            text: "Alter Database",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate("Alter Database", node.tree.tag.alter_database.replace("#database_name#", node.text));
            }
          },
          {
            text: "Drop Database",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate("Drop Database", node.tree.tag.drop_database.replace("#database_name#", node.text));
            }
          }
        ]
      },
      cm_roles: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMariadb(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Role",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate("Create Role", node.tree.tag.create_role);
            }
          }
        ]
      },
      cm_role: {
        elements: [
          {
            text: "Alter Role",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate("Alter Role", node.tree.tag.alter_role.replace("#role_name#", node.text));
            }
          },
          {
            text: "Drop Role",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate("Drop Role", node.tree.tag.drop_role.replace("#role_name#", node.text));
            }
          }
        ]
      },
      cm_tables: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMariadb(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Table",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate("Create Table", node.tree.tag.create_table.replace("#schema_name#", node.parent.text));
            }
          }
        ]
      },
      cm_table: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMariadb(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Data Actions",
            icon: "fas cm-all fa-list",
            submenu: {
              elements: [
                {
                  text: "Query Data",
                  icon: "fas cm-all fa-search",
                  action: function(node) {
                    TemplateSelectMariadb(node.parent.parent.text, node.text);
                  }
                },
                {
                  text: "Edit Data",
                  icon: "fas cm-all fa-table",
                  action: function(node) {
                    v_startEditData(node.text, node.parent.parent.text);
                  }
                },
                {
                  text: "Insert Record",
                  icon: "fas cm-all fa-edit",
                  action: function(node) {
                    TemplateInsertMariadb(node.parent.parent.text, node.text);
                  }
                },
                {
                  text: "Update Records",
                  icon: "fas cm-all fa-edit",
                  action: function(node) {
                    TemplateUpdateMariadb(node.parent.parent.text, node.text);
                  }
                },
                {
                  text: "Delete Records",
                  icon: "fas cm-all fa-times",
                  action: function(node) {
                    tabSQLTemplate(
                      "Delete Records",
                      node.tree.tag.delete.replace("#table_name#", node.parent.parent.text + "." + node.text)
                    );
                  }
                }
              ]
            }
          },
          {
            text: "Table Actions",
            icon: "fas cm-all fa-list",
            submenu: {
              elements: [
                {
                  text: "Alter Table",
                  icon: "fas cm-all fa-table",
                  action: function(node) {
                    startAlterTable(true, "alter", node.text, node.parent.parent.text);
                  }
                },
                {
                  text: "Alter Table (SQL)",
                  icon: "fas cm-all fa-edit",
                  action: function(node) {
                    tabSQLTemplate(
                      "Alter Table",
                      node.tree.tag.alter_table.replace("#table_name#", node.parent.parent.text + "." + node.text)
                    );
                  }
                },
                {
                  text: "Drop Table",
                  icon: "fas cm-all fa-times",
                  action: function(node) {
                    tabSQLTemplate(
                      "Drop Table",
                      node.tree.tag.drop_table.replace("#table_name#", node.parent.parent.text + "." + node.text)
                    );
                  }
                }
              ]
            }
          }
        ]
      },
      cm_columns: {
        elements: [
          {
            text: "Create Column",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate(
                "Create Field",
                node.tree.tag.create_column.replace(
                  "#table_name#",
                  node.parent.parent.parent.text + "." + node.parent.text
                )
              );
            }
          }
        ]
      },
      cm_column: {
        elements: [
          {
            text: "Alter Column",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate(
                "Alter Column",
                node.tree.tag.alter_column.replace("#table_name#", node.parent.parent.parent.parent.text + "." + node.parent.parent.text).replace(/#column_name#/g, node.text)
              );
            }
          },
          {
            text: "Drop Column",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate(
                "Drop Column",
                node.tree.tag.drop_column.replace("#table_name#", node.parent.parent.parent.parent.text + "." + node.parent.parent.text).replace(/#column_name#/g, node.text)
              );
            }
          }
        ]
      },
      cm_pks: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMariadb(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Primary Key",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate(
                "Create Primary Key",
                node.tree.tag.create_primarykey.replace(
                  "#table_name#",
                  node.parent.parent.parent.text + "." + node.parent.text
                )
              );
            }
          }
        ]
      },
      cm_pk: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMariadb(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Drop Primary Key",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate(
                "Drop Primary Key",
                node.tree.tag.drop_primarykey.replace("#table_name#", node.parent.parent.parent.parent.text + "." + node.parent.parent.text).replace("#constraint_name#", node.text)
              );
            }
          }
        ]
      },
      cm_fks: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMariadb(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Foreign Key",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate(
                "Create Foreign Key",
                node.tree.tag.create_foreignkey.replace(
                  "#table_name#",
                  node.parent.parent.parent.text + "." + node.parent.text
                )
              );
            }
          }
        ]
      },
      cm_fk: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMariadb(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Drop Foreign Key",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate(
                "Drop Foreign Key",
                node.tree.tag.drop_foreignkey.replace("#table_name#", node.parent.parent.parent.parent.text + "." + node.parent.parent.text).replace("#constraint_name#", node.text)
              );
            }
          }
        ]
      },
      cm_uniques: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMariadb(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Unique",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate(
                "Create Unique",
                node.tree.tag.create_unique.replace(
                  "#table_name#",
                  node.parent.parent.parent.text + "." + node.parent.text
                )
              );
            }
          }
        ]
      },
      cm_unique: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMariadb(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Drop Unique",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate(
                "Drop Unique",
                node.tree.tag.drop_unique.replace("#table_name#", node.parent.parent.parent.parent.text + "." + node.parent.parent.text).replace("#constraint_name#", node.text)
              );
            }
          }
        ]
      },
      cm_indexes: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMariadb(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Index",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate(
                "Create Index",
                node.tree.tag.create_index.replace(
                  "#table_name#",
                  node.parent.parent.parent.text + "." + node.parent.text
                )
              );
            }
          }
        ]
      },
      cm_index: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMariadb(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Drop Index",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate(
                "Drop Index",
                node.tree.tag.drop_index.replace(
                  "#index_name#",
                  node.parent.parent.parent.parent.text + "." + node.text.replace(" (Unique)", "").replace(" (Non Unique)", "")
                )
              );
            }
          }
        ]
      },
      cm_sequences: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeOracle(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Sequence",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate("Create Sequence", node.tree.tag.create_sequence.replace("#schema_name#", node.parent.text));
            }
          }
        ]
      },
      cm_sequence: {
        elements: [
          {
            text: "Alter Sequence",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate(
                "Alter Sequence",
                node.tree.tag.alter_sequence.replace("#sequence_name#", node.parent.parent.text + "." + node.text)
              );
            }
          },
          {
            text: "Drop Sequence",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate(
                "Drop Sequence",
                node.tree.tag.drop_sequence.replace("#sequence_name#", node.parent.parent.text + "." + node.text)
              );
            }
          }
        ]
      },
      cm_views: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMariadb(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create View",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate("Create View", node.tree.tag.create_view.replace("#schema_name#", node.parent.text));
            }
          }
        ]
      },
      cm_view: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMariadb(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Query Data",
            icon: "fas cm-all fa-search",
            action: function(node) {
              var v_table_name = "";
              v_table_name = node.parent.parent.text + "." + node.text;
              v_connTabControl.tag.createQueryTab(node.text);
              v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(
                "-- Querying Data\nselect t.*\nfrom " + v_table_name + " t"
              );
              v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
              renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);
              querySQL(0);
            }
          },
          {
            text: "Edit View",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              v_connTabControl.tag.createQueryTab(node.text);
              getViewDefinitionMariadb(node);
            }
          },
          {
            text: "Drop View",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate(
                "Drop View",
                node.tree.tag.drop_view.replace("#view_name#", node.parent.parent.text + "." + node.text)
              );
            }
          }
        ]
      },
      /*'cm_triggers': {
      	elements: [{
      		text: 'Refresh',
      		icon: 'fas cm-all fa-sync-alt',
      		action: function(node) {
      			if (node.childNodes == 0)
      				refreshTreeMariadb(node);
      			else {
      				node.collapseNode();
      				node.expandNode();
      			}
      		},
      	}, {
      		text: 'Create Trigger',
      		icon: 'fas cm-all fa-edit',
      		action: function(node) {
      			tabSQLTemplate('Create Trigger', node.tree.tag
      				.create_trigger.replace(
      					'#table_name#', node.tree.tag.v_database + '.' + node.parent
      					.text));
      		}
      	}, {
      		text: 'Doc: Triggers',
      		icon: 'fas cm-all fa-globe-americas',
      		action: function(node) {
      			v_connTabControl.tag.createWebsiteTab(
      				'Documentation: Triggers',
      				'https://www.postgresql.org/docs/' +
      				getMajorVersionMariadb(node.tree.tag.version) +
      				'/static/trigger-definition.html');
      		}
      	}]
      },
      'cm_view_triggers': {
      	elements: [{
      		text: 'Refresh',
      		icon: 'fas cm-all fa-sync-alt',
      		action: function(node) {
      			if (node.childNodes == 0)
      				refreshTreeMariadb(node);
      			else {
      				node.collapseNode();
      				node.expandNode();
      			}
      		},
      	}, {
      		text: 'Create Trigger',
      		icon: 'fas cm-all fa-edit',
      		action: function(node) {
      			tabSQLTemplate('Create Trigger', node.tree.tag
      				.create_view_trigger.replace(
      					'#table_name#', node.tree.tag.v_database + '.' + node.parent
      					.text));
      		}
      	}, {
      		text: 'Doc: Triggers',
      		icon: 'fas cm-all fa-globe-americas',
      		action: function(node) {
      			v_connTabControl.tag.createWebsiteTab(
      				'Documentation: Triggers',
      				'https://www.postgresql.org/docs/' +
      				getMajorVersionMariadb(node.tree.tag.version) +
      				'/static/trigger-definition.html');
      		}
      	}]
      },
      'cm_trigger': {
      	elements: [{
      		text: 'Alter Trigger',
      		icon: 'fas cm-all fa-edit',
      		action: function(node) {
      			tabSQLTemplate('Alter Trigger', node.tree.tag
      				.alter_trigger.replace(
      					'#table_name#', node.tree.tag.v_database + '.' +
      					node.parent.parent.text).replace(
      					'#trigger_name#', node.text));
      		}
      	}, {
      		text: 'Enable Trigger',
      		icon: 'fas cm-all fa-edit',
      		action: function(node) {
      			tabSQLTemplate('Enable Trigger', node.tree.tag
      				.enable_trigger.replace(
      					'#table_name#', node.tree.tag.v_database + '.' +
      					node.parent.parent.text).replace(
      					'#trigger_name#', node.text));
      		}
      	}, {
      		text: 'Disable Trigger',
      		icon: 'fas cm-all fa-edit',
      		action: function(node) {
      			tabSQLTemplate('Disable Trigger', node.tree
      				.tag.disable_trigger.replace(
      					'#table_name#', node.tree.tag.v_database + '.' +
      					node.parent.parent.text).replace(
      					'#trigger_name#', node.text));
      		}
      	}, {
      		text: 'Drop Trigger',
      		icon: 'fas cm-all fa-times',
      		action: function(node) {
      			tabSQLTemplate('Drop Trigger', node.tree.tag
      				.drop_trigger.replace(
      					'#table_name#', node.tree.tag.v_database + '.' +
      					node.parent.parent.text).replace(
      					'#trigger_name#', node.text));
      		}
      	}]
      },
      'cm_partitions': {
      	elements: [{
      		text: 'Refresh',
      		icon: 'fas cm-all fa-sync-alt',
      		action: function(node) {
      			if (node.childNodes == 0)
      				refreshTreeMariadb(node);
      			else {
      				node.collapseNode();
      				node.expandNode();
      			}
      		}
      	}, {
      		text: 'Create Partition',
      		icon: 'fas cm-all fa-edit',
      		action: function(node) {
      			tabSQLTemplate('Create Partition', node.tree
      				.tag.create_partition.replace(
      					'#table_name#', node.tree.tag.v_database + '.' + node.parent
      					.text));
      		}
      	}, {
      		text: 'Doc: Partitions',
      		icon: 'fas cm-all fa-globe-americas',
      		action: function(node) {
      			v_connTabControl.tag.createWebsiteTab(
      				'Documentation: Partitions',
      				'https://www.postgresql.org/docs/' +
      				getMajorVersionMariadb(node.tree.tag.version) +
      				'/static/ddl-partitioning.html');
      		}
      	}]
      },
      'cm_partition': {
      	elements: [{
      		text: 'No Inherit Partition',
      		icon: 'fas cm-all fa-edit',
      		action: function(node) {
      			tabSQLTemplate('No Inherit Partition', node
      				.tree.tag.noinherit_partition.replace(
      					'#table_name#', node.tree.tag.v_database + '.' +
      					node.parent.parent.text).replace(
      					'#partition_name#', node.text));
      		}
      	}, {
      		text: 'Drop Partition',
      		icon: 'fas cm-all fa-times',
      		action: function(node) {
      			tabSQLTemplate('Drop Partition', node.tree.tag
      				.drop_partition.replace(
      					'#partition_name#', node.text));
      		}
      	}]
      },*/
      cm_functions: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMariadb(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Function",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate("Create Function", node.tree.tag.create_function.replace("#schema_name#", node.parent.text));
            }
          }
        ]
      },
      cm_function: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMariadb(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Edit Function",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              v_connTabControl.tag.createQueryTab(node.text);
              getFunctionDefinitionMariadb(node);
            }
          },
          {
            text: "Drop Function",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate("Drop Function", node.tree.tag.drop_function.replace("#function_name#", node.tag.id));
            }
          }
        ]
      },
      cm_procedures: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMariadb(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Procedure",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate("Create Procedure", node.tree.tag.create_procedure.replace("#schema_name#", node.parent.text));
            }
          }
        ]
      },
      cm_procedure: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMariadb(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Edit Procedure",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              v_connTabControl.tag.createQueryTab(node.text);
              getProcedureDefinitionMariadb(node);
            }
          },
          {
            text: "Drop Procedure",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate("Drop Procedure", node.tree.tag.drop_procedure.replace("#function_name#", node.tag.id));
            }
          }
        ]
      },
      cm_refresh: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMariadb(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          }
        ]
      }
    };
    var tree = createTree(p_div, "#fcfdfd", context_menu);
    v_connTabControl.selectedTab.tag.tree = tree;
    let v_autocomplete_switch_status = v_connTabControl.selectedTab.tag.enable_autocomplete !== false ? " checked " : "";
    v_connTabControl.selectedTab.tag.divDetails.innerHTML = '<i class="fas fa-server me-1"></i>selected DB: <b>' + escapeHtml(v_connTabControl.selectedTab.tag.selectedDatabase) + '</b><div class="omnidb__switch omnidb__switch--sm float-end" data-bs-toggle="tooltip" data-bs-placement="bottom" data-bs-html="true" title="" data-bs-original-title="<h5>Toggle autocomplete.</h5><div>Switch OFF <b>disables the autocomplete</b> on the inner tabs for this connection.</div>"><input type="checkbox" ' + v_autocomplete_switch_status + ' id="autocomplete_toggler_' + v_connTabControl.selectedTab.tag.tab_id + `" class="omnidb__switch--input" onchange="toggleConnectionAutocomplete('autocomplete_toggler_` + v_connTabControl.selectedTab.tag.tab_id + `')"><label for="autocomplete_toggler_` + v_connTabControl.selectedTab.tag.tab_id + '" class="omnidb__switch--label"><span><i class="fas fa-spell-check"></i></span></label></div>';
    tree.nodeAfterOpenEvent = function(node) {
      refreshTreeMariadb(node);
    };
    tree.clickNodeEvent = function(node) {
      if (v_connTabControl.selectedTab.tag.treeTabsVisible) {
        getPropertiesMariadb(node);
      }
    };
    tree.beforeContextMenuEvent = function(node, callback) {
      var v_elements = [];
      if (v_connTabControl.tag.hooks.mariadbTreeContextMenu.length > 0) {
        for (var i2 = 0; i2 < v_connTabControl.tag.hooks.mariadbTreeContextMenu.length; i2++)
          v_elements = v_elements.concat(v_connTabControl.tag.hooks.mariadbTreeContextMenu[i2](node));
      }
      var v_customCallback = function() {
        callback(v_elements);
      };
      v_customCallback();
    };
    var node_server = tree.createNode(
      "MariaDB",
      false,
      "node-mariadb",
      null,
      {
        type: "server"
      },
      "cm_server"
    );
    node_server.createChildNode("", true, "node-spin", null, null);
    tree.drawTree();
  }
  function getPropertiesMariadb(node) {
    if (node.tag != void 0)
      if (node.tag.type == "table") {
        getProperties("/get_properties_mariadb/", {
          p_schema: node.parent.parent.text,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "sequence") {
        getProperties("/get_properties_mariadb/", {
          p_schema: node.parent.parent.text,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "view") {
        getProperties("/get_properties_mariadb/", {
          p_schema: node.parent.parent.text,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "function") {
        getProperties("/get_properties_mariadb/", {
          p_schema: node.parent.parent.text,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "procedure") {
        getProperties("/get_properties_mariadb/", {
          p_schema: node.parent.parent.text,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else {
        clearProperties();
      }
    if (v_connTabControl.tag.hooks.mariadbTreeNodeClick.length > 0) {
      for (var i2 = 0; i2 < v_connTabControl.tag.hooks.mariadbTreeNodeClick.length; i2++)
        v_connTabControl.tag.hooks.mariadbTreeNodeClick[i2](node);
    }
  }
  function refreshTreeMariadb(node) {
    if (node.tag != void 0)
      if (node.tag.type == "table_list") {
        getTablesMariadb(node);
      } else if (node.tag.type == "table") {
        getColumnsMariadb(node);
      } else if (node.tag.type == "primary_key") {
        getPKMariadb(node);
      } else if (node.tag.type == "pk") {
        getPKColumnsMariadb(node);
      } else if (node.tag.type == "uniques") {
        getUniquesMariadb(node);
      } else if (node.tag.type == "unique") {
        getUniquesColumnsMariadb(node);
      } else if (node.tag.type == "foreign_keys") {
        getFKsMariadb(node);
      } else if (node.tag.type == "foreign_key") {
        getFKsColumnsMariadb(node);
      } else if (node.tag.type == "view_list") {
        getViewsMariadb(node);
      } else if (node.tag.type == "view") {
        getViewsColumnsMariadb(node);
      } else if (node.tag.type == "indexes") {
        getIndexesMariadb(node);
      } else if (node.tag.type == "index") {
        getIndexesColumnsMariadb(node);
      } else if (node.tag.type == "function_list") {
        getFunctionsMariadb(node);
      } else if (node.tag.type == "function") {
        getFunctionFieldsMariadb(node);
      } else if (node.tag.type == "procedure_list") {
        getProceduresMariadb(node);
      } else if (node.tag.type == "procedure") {
        getProcedureFieldsMariadb(node);
      } else if (node.tag.type == "sequence_list") {
        getSequencesMariadb(node);
      } else if (node.tag.type == "database_list") {
        getDatabasesMariadb(node);
      } else if (node.tag.type == "database") {
        getDatabaseObjectsMariadb(node);
      } else if (node.tag.type == "role_list") {
        getRolesMariadb(node);
      } else if (node.tag.type == "server") {
        getTreeDetailsMariadb(node);
      } else {
        afterNodeOpenedCallbackMariaDB(node);
      }
  }
  function afterNodeOpenedCallbackMariaDB(node) {
    if (v_connTabControl.tag.hooks.mariadbTreeNodeOpen.length > 0) {
      for (var i2 = 0; i2 < v_connTabControl.tag.hooks.mariadbTreeNodeOpen.length; i2++)
        v_connTabControl.tag.hooks.mariadbTreeNodeOpen[i2](node);
    }
  }
  function getTreeDetailsMariadb(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_tree_info_mariadb/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id
      }),
      function(p_return) {
        node.tree.contextMenu.cm_server.elements = [];
        node.tree.contextMenu.cm_server.elements.push({
          text: "Refresh",
          icon: "fas cm-all fa-sync-alt",
          action: function(node2) {
            if (node2.childNodes == 0) refreshTreeMariadb(node2);
            else {
              node2.collapseNode();
              node2.expandNode();
            }
          }
        });
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.tree.tag = {
          v_database: p_return.v_data.v_database_return.v_database,
          version: p_return.v_data.v_database_return.version,
          v_username: p_return.v_data.v_database_return.v_username,
          superuser: p_return.v_data.v_database_return.superuser,
          create_role: p_return.v_data.v_database_return.create_role,
          alter_role: p_return.v_data.v_database_return.alter_role,
          drop_role: p_return.v_data.v_database_return.drop_role,
          create_database: p_return.v_data.v_database_return.create_database,
          alter_database: p_return.v_data.v_database_return.alter_database,
          drop_database: p_return.v_data.v_database_return.drop_database,
          create_function: p_return.v_data.v_database_return.create_function,
          drop_function: p_return.v_data.v_database_return.drop_function,
          create_procedure: p_return.v_data.v_database_return.create_procedure,
          drop_procedure: p_return.v_data.v_database_return.drop_procedure,
          //create_triggerfunction: p_return.v_data.v_database_return
          //    .create_triggerfunction,
          //drop_triggerfunction: p_return.v_data.v_database_return
          //    .drop_triggerfunction,
          create_sequence: p_return.v_data.v_database_return.create_sequence,
          alter_sequence: p_return.v_data.v_database_return.alter_sequence,
          drop_sequence: p_return.v_data.v_database_return.drop_sequence,
          create_view: p_return.v_data.v_database_return.create_view,
          drop_view: p_return.v_data.v_database_return.drop_view,
          create_table: p_return.v_data.v_database_return.create_table,
          alter_table: p_return.v_data.v_database_return.alter_table,
          drop_table: p_return.v_data.v_database_return.drop_table,
          create_column: p_return.v_data.v_database_return.create_column,
          alter_column: p_return.v_data.v_database_return.alter_column,
          drop_column: p_return.v_data.v_database_return.drop_column,
          create_primarykey: p_return.v_data.v_database_return.create_primarykey,
          drop_primarykey: p_return.v_data.v_database_return.drop_primarykey,
          create_unique: p_return.v_data.v_database_return.create_unique,
          drop_unique: p_return.v_data.v_database_return.drop_unique,
          create_foreignkey: p_return.v_data.v_database_return.create_foreignkey,
          drop_foreignkey: p_return.v_data.v_database_return.drop_foreignkey,
          create_index: p_return.v_data.v_database_return.create_index,
          drop_index: p_return.v_data.v_database_return.drop_index,
          //create_trigger: p_return.v_data.v_database_return.create_trigger,
          //create_view_trigger: p_return.v_data.v_database_return.create_view_trigger,
          //alter_trigger: p_return.v_data.v_database_return.alter_trigger,
          //enable_trigger: p_return.v_data.v_database_return.enable_trigger,
          //disable_trigger: p_return.v_data.v_database_return.disable_trigger,
          //drop_trigger: p_return.v_data.v_database_return.drop_trigger,
          //create_partition: p_return.v_data.v_database_return.create_partition,
          //noinherit_partition: p_return.v_data.v_database_return.noinherit_partition,
          //drop_partition: p_return.v_data.v_database_return.drop_partition
          delete: p_return.v_data.v_database_return.delete
        };
        node.tree.contextMenu.cm_server.elements.push({
          text: "Monitoring",
          icon: "fas cm-all fa-chart-line",
          action: function(node2) {
          },
          submenu: {
            elements: [
              /*{
              	text: 'Dashboard',
              	icon: 'fas cm-all fa-chart-line',
              	action: function(node) {
              		v_connTabControl.tag.createMonitorDashboardTab();
              		startMonitorDashboard();
              	}
              }, */
              {
                text: "Process List",
                icon: "fas cm-all fa-chart-line",
                action: function(node2) {
                  v_connTabControl.tag.createMonitoringTab(
                    "Process List",
                    "select * from information_schema.processlist",
                    [
                      {
                        icon: "fas cm-all fa-times",
                        title: "Terminate",
                        action: "mariadbTerminateBackend"
                      }
                    ]
                  );
                }
              }
            ]
          }
        });
        node.setText(p_return.v_data.v_database_return.version);
        var node_databases = node.createChildNode(
          "Databases",
          false,
          "fas node-all fa-database node-database-list",
          {
            type: "database_list",
            num_databases: 0
          },
          "cm_databases"
        );
        node_databases.createChildNode("", true, "node-spin", null, null);
        if (node.tree.tag.superuser) {
          var node_roles = node.createChildNode(
            "Roles",
            false,
            "fas node-all fa-users node-user-list",
            {
              type: "role_list",
              num_roles: 0
            },
            "cm_roles"
          );
          node_roles.createChildNode("", true, "node-spin", null, null);
        }
        if (v_connTabControl.selectedTab.tag.firstTimeOpen) {
          v_connTabControl.selectedTab.tag.firstTimeOpen = false;
        }
        afterNodeOpenedCallbackMariaDB(node);
      },
      function(p_return) {
        nodeOpenErrorMariadb(p_return, node);
      },
      "box",
      false
    );
  }
  function getDatabaseObjectsMariadb(node) {
    node.removeChildNodes();
    var node_tables = node.createChildNode(
      "Tables",
      false,
      "fas node-all fa-th node-table-list",
      {
        type: "table_list",
        num_tables: 0,
        database: v_connTabControl.selectedTab.tag.selectedDatabase
      },
      "cm_tables"
    );
    node_tables.createChildNode("", true, "node-spin", null, null);
    if (parseFloat(getMajorVersionMariadb(node.tree.tag.version)) >= 10.3) {
      var node_sequences = node.createChildNode(
        "Sequences",
        false,
        "fas node-all fa-sort-numeric-down node-sequence-list",
        {
          type: "sequence_list",
          num_sequences: 0,
          database: v_connTabControl.selectedTab.tag.selectedDatabase
        },
        "cm_sequences"
      );
      node_sequences.createChildNode("", true, "node-spin", null, null);
    }
    var node_views = node.createChildNode(
      "Views",
      false,
      "fas node-all fa-eye node-view-list",
      {
        type: "view_list",
        num_views: 0,
        database: v_connTabControl.selectedTab.tag.selectedDatabase
      },
      "cm_views"
    );
    node_views.createChildNode("", true, "node-spin", null, null);
    var node_functions = node.createChildNode(
      "Functions",
      false,
      "fas node-all fa-cog node-function-list",
      {
        type: "function_list",
        num_functions: 0,
        database: v_connTabControl.selectedTab.tag.selectedDatabase
      },
      "cm_functions"
    );
    node_functions.createChildNode("", true, "node-spin", null, null);
    var node_functions = node.createChildNode(
      "Procedures",
      false,
      "fas node-all fa-cog node-procedure-list",
      {
        type: "procedure_list",
        num_functions: 0,
        database: v_connTabControl.selectedTab.tag.selectedDatabase
      },
      "cm_procedures"
    );
    node_functions.createChildNode("", true, "node-spin", null, null);
    afterNodeOpenedCallbackMariaDB(node);
  }
  function getDatabasesMariadb(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_databases_mariadb/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Databases (" + p_return.v_data.length + ")");
        node.tag.num_databases = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          var v_node2 = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-database node-database",
            {
              type: "database",
              database: p_return.v_data[i].v_name.replace(/"/g, "")
            },
            "cm_database",
            null,
            false
          );
          if (v_connTabControl.selectedTab.tag.selectedDatabase == p_return.v_data[i].v_name.replace(/"/g, "")) {
            v_node2.setNodeBold();
            v_connTabControl.selectedTab.tag.selectedDatabaseNode = v_node2;
          }
          v_node2.createChildNode("", true, "node-spin", null, null, null, false);
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackMariaDB(node);
      },
      function(p_return) {
        nodeOpenErrorMariadb(p_return, node);
      },
      "box",
      false
    );
  }
  function getRolesMariadb(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_roles_mariadb/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Roles (" + p_return.v_data.length + ")");
        node.tag.num_tablespaces = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-user node-user",
            {
              type: "role",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_role",
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackMariaDB(node);
      },
      function(p_return) {
        nodeOpenErrorMariadb(p_return, node);
      },
      "box",
      false
    );
  }
  function getTablesMariadb(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_tables_mariadb/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: node.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Tables (" + p_return.v_data.length + ")");
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-table node-table",
            {
              type: "table",
              has_primary_keys: p_return.v_data[i].v_has_primary_keys,
              has_foreign_keys: p_return.v_data[i].v_has_foreign_keys,
              has_uniques: p_return.v_data[i].v_has_uniques,
              has_indexes: p_return.v_data[i].v_has_indexes,
              has_checks: p_return.v_data[i].v_has_checks,
              has_excludes: p_return.v_data[i].v_has_excludes,
              has_rules: p_return.v_data[i].v_has_rules,
              has_triggers: p_return.v_data[i].v_has_triggers,
              has_partitions: p_return.v_data[i].v_has_partitions,
              has_statistics: p_return.v_data[i].v_has_statistics,
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_table",
            null,
            false
          );
          v_node.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "table_field",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackMariaDB(node);
      },
      function(p_return) {
        nodeOpenErrorMariadb(p_return, node);
      },
      "box",
      false
    );
  }
  function getSequencesMariadb(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_sequences_mariadb/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_schema: null
      }),
      function(p_return) {
        node.setText("Sequences (" + p_return.v_data.length + ")");
        node.tag.num_tables = p_return.v_data.length;
        if (node.childNodes.length > 0) node.removeChildNodes();
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_sequence_name,
            false,
            "fas node-all fa-sort-numeric-down node-sequence",
            {
              type: "sequence"
            },
            "cm_sequence",
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackMariaDB(node);
      },
      function(p_return) {
        nodeOpenErrorMariadb(p_return, node);
      },
      "box",
      false
    );
  }
  function getViewsMariadb(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_views_mariadb/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: node.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Views (" + p_return.v_data.length + ")");
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-eye node-view",
            {
              type: "view",
              has_triggers: p_return.v_data[i].v_has_triggers,
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_view",
            null,
            false
          );
          v_node.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "view_field",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackMariaDB(node);
      },
      function(p_return) {
        nodeOpenErrorMariadb(p_return, node);
      },
      "box",
      false
    );
  }
  function getViewsColumnsMariadb(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_views_columns_mariadb/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.text,
        p_schema: node.parent.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        v_list = node.createChildNode(
          "Columns (" + p_return.v_data.length + ")",
          false,
          "fas node-all fa-columns node-column",
          null,
          null,
          null,
          false
        );
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = v_list.createChildNode(
            p_return.v_data[i].v_column_name,
            false,
            "fas node-all fa-columns node-column",
            {
              type: "table_field",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
          v_node.createChildNode(
            "Type: " + p_return.v_data[i].v_data_type,
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            null,
            null,
            null,
            false
          );
        }
        if (node.tag.has_rules) {
          v_node = node.createChildNode(
            "Rules",
            false,
            "fas node-all fa-lightbulb node-rule",
            {
              type: "rule_list",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_rules",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_triggers) {
          v_node = node.createChildNode(
            "Triggers",
            false,
            "fas node-all fa-bolt node-trigger",
            {
              type: "trigger_list",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_view_triggers",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackMariaDB(node);
      },
      function(p_return) {
        nodeOpenErrorMariadb(p_return, node);
      },
      "box",
      false
    );
  }
  function getViewDefinitionMariadb(node) {
    execAjax(
      "/get_view_definition_mariadb/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_view: node.text,
        p_schema: node.parent.parent.text
      }),
      function(p_return) {
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data);
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
        renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);
        var v_div_result = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;
        if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht != null) {
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht.destroy();
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht = null;
        }
        v_div_result.innerHTML = "";
        maximizeEditor();
      },
      function(p_return) {
        nodeOpenErrorMariadb(p_return, node);
      },
      "box",
      true
    );
  }
  function getColumnsMariadb(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_columns_mariadb/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.text,
        p_schema: node.parent.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        v_list = node.createChildNode(
          "Columns (" + p_return.v_data.length + ")",
          false,
          "fas node-all fa-columns node-column",
          {
            type: "column_list",
            database: v_connTabControl.selectedTab.tag.selectedDatabase
          },
          "cm_columns",
          null,
          false
        );
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = v_list.createChildNode(
            p_return.v_data[i].v_column_name,
            false,
            "fas node-all fa-columns node-column",
            {
              type: "table_field",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_column",
            null,
            false
          );
          v_node.createChildNode(
            "Type: " + p_return.v_data[i].v_data_type,
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            null,
            null,
            null,
            false
          );
          v_node.createChildNode(
            "Nullable: " + p_return.v_data[i].v_nullable,
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            null,
            null,
            null,
            false
          );
        }
        if (node.tag.has_primary_keys) {
          v_node = node.createChildNode(
            "Primary Key",
            false,
            "fas node-all fa-key node-pkey",
            {
              type: "primary_key",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_pks",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_foreign_keys) {
          v_node = node.createChildNode(
            "Foreign Keys",
            false,
            "fas node-all fa-key node-fkey",
            {
              type: "foreign_keys",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_fks",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_uniques) {
          v_node = node.createChildNode(
            "Uniques",
            false,
            "fas node-all fa-key node-unique",
            {
              type: "uniques",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_uniques",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_indexes) {
          v_node = node.createChildNode(
            "Indexes",
            false,
            "fas node-all fa-thumbtack node-index",
            {
              type: "indexes",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_indexes",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_triggers) {
          v_node = node.createChildNode(
            "Triggers",
            false,
            "fas node-all fa-bolt node-trigger",
            {
              type: "trigger_list",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_triggers",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_partitions) {
          v_node = node.createChildNode(
            "Partitions",
            false,
            "fas node-all fa-table node-partition",
            {
              type: "partition_list",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_partitions",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackMariaDB(node);
      },
      function(p_return) {
        nodeOpenErrorMariadb(p_return, node);
      },
      "box",
      false
    );
  }
  function getPKMariadb(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_pk_mariadb/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.text,
        p_schema: node.parent.parent.parent.text
      }),
      function(p_return) {
        node.setText("Primary Key (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) {
          node.removeChildNodes();
        }
        if (p_return.v_data.length > 0) {
          v_node = node.createChildNode(
            p_return.v_data[0][0],
            false,
            "fas node-all fa-key node-pkey",
            {
              type: "pk",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_pk"
          );
          v_node.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "pk_field",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null
          );
        }
        afterNodeOpenedCallbackMariaDB(node);
      },
      function(p_return) {
        nodeOpenErrorMariadb(p_return, node);
      },
      "box",
      false
    );
  }
  function getPKColumnsMariadb(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_pk_columns_mariadb/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_key: node.text,
        p_table: node.parent.parent.text,
        p_schema: node.parent.parent.parent.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node.createChildNode(
            p_return.v_data[i][0],
            false,
            "fas node-all fa-columns node-column",
            null,
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackMariaDB(node);
      },
      function(p_return) {
        nodeOpenErrorMariadb(p_return, node);
      },
      "box",
      false
    );
  }
  function getUniquesMariadb(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_uniques_mariadb/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.text,
        p_schema: node.parent.parent.parent.text
      }),
      function(p_return) {
        node.setText("Uniques (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) node.removeChildNodes();
        if (p_return.v_data.length > 0) {
          for (i = 0; i < p_return.v_data.length; i++) {
            v_node = node.createChildNode(
              p_return.v_data[i][0],
              false,
              "fas node-all fa-key node-unique",
              {
                type: "unique",
                database: v_connTabControl.selectedTab.tag.selectedDatabase
              },
              "cm_unique",
              null,
              false
            );
            v_node.createChildNode(
              "",
              false,
              "node-spin",
              {
                type: "unique_field",
                database: v_connTabControl.selectedTab.tag.selectedDatabase
              },
              null,
              null,
              false
            );
          }
          node.drawChildNodes();
        }
        afterNodeOpenedCallbackMariaDB(node);
      },
      function(p_return) {
        nodeOpenErrorMariadb(p_return, node);
      },
      "box",
      false
    );
  }
  function getUniquesColumnsMariadb(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_uniques_columns_mariadb/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_unique: node.text,
        p_table: node.parent.parent.text,
        p_schema: node.parent.parent.parent.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        if (p_return.v_data.length > 0) {
          for (i = 0; i < p_return.v_data.length; i++) {
            node.createChildNode(
              p_return.v_data[i][0],
              false,
              "fas node-all fa-columns node-column",
              null,
              null,
              null,
              false
            );
          }
          node.drawChildNodes();
        }
        afterNodeOpenedCallbackMariaDB(node);
      },
      function(p_return) {
        nodeOpenErrorMariadb(p_return, node);
      },
      "box",
      false
    );
  }
  function getIndexesMariadb(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_indexes_mariadb/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.text,
        p_schema: node.parent.parent.parent.text
      }),
      function(p_return) {
        node.setText("Indexes (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) node.removeChildNodes();
        var v_node2;
        if (p_return.v_data.length > 0) {
          for (i = 0; i < p_return.v_data.length; i++) {
            v_node2 = node.createChildNode(
              p_return.v_data[i][0] + " (" + p_return.v_data[i][1] + ")",
              false,
              "fas node-all fa-thumbtack node-index",
              {
                type: "index",
                database: v_connTabControl.selectedTab.tag.selectedDatabase
              },
              "cm_index",
              null,
              false
            );
            v_node2.createChildNode(
              "",
              false,
              "node-spin",
              {
                type: "index_field"
              },
              null,
              null,
              false
            );
          }
          node.drawChildNodes();
        }
        afterNodeOpenedCallbackMariaDB(node);
      },
      function(p_return) {
        nodeOpenErrorMariadb(p_return, node);
      },
      "box",
      false
    );
  }
  function getIndexesColumnsMariadb(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_indexes_columns_mariadb/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_index: node.text.replace(" (Non Unique)", "").replace(" (Unique)", ""),
        p_table: node.parent.parent.text,
        p_schema: node.parent.parent.parent.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        if (p_return.v_data.length > 0) {
          for (i = 0; i < p_return.v_data.length; i++) {
            node.createChildNode(
              p_return.v_data[i][0],
              false,
              "fas node-all fa-columns node-column",
              null,
              null,
              null,
              false
            );
          }
          node.drawChildNodes();
        }
        afterNodeOpenedCallbackMariaDB(node);
      },
      function(p_return) {
        nodeOpenErrorMariadb(p_return, node);
      },
      "box",
      false
    );
  }
  function getFKsMariadb(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_fks_mariadb/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.text,
        p_schema: node.parent.parent.parent.text
      }),
      function(p_return) {
        node.setText("Foreign Keys (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) node.removeChildNodes();
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i][0],
            false,
            "fas node-all fa-key node-fkey",
            {
              type: "foreign_key",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_fk",
            null,
            false
          );
          v_node.createChildNode(
            "Referenced Table: " + p_return.v_data[i][1],
            false,
            "fas node-all fa-table node-table",
            null,
            null,
            null,
            false
          );
          v_node.createChildNode(
            "Delete Rule: " + p_return.v_data[i][2],
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            null,
            null,
            null,
            false
          );
          v_node.createChildNode(
            "Update Rule: " + p_return.v_data[i][3],
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            null,
            null,
            null,
            false
          );
          v_curr_fk = p_return.v_data[i][0];
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackMariaDB(node);
      },
      function(p_return) {
        nodeOpenErrorMariadb(p_return, node);
      },
      "box",
      false
    );
  }
  function getFKsColumnsMariadb(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_fks_columns_mariadb/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_fkey: node.text,
        p_table: node.parent.parent.text,
        p_schema: node.parent.parent.parent.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.createChildNode(
          "Referenced Table: " + p_return.v_data[0][0],
          false,
          "fas node-all fa-table node-table",
          null,
          null,
          null,
          false
        );
        node.createChildNode(
          "Delete Rule: " + p_return.v_data[0][1],
          false,
          "fas node-all fa-ellipsis-h node-bullet",
          null,
          null,
          null,
          false
        );
        node.createChildNode(
          "Update Rule: " + p_return.v_data[0][2],
          false,
          "fas node-all fa-ellipsis-h node-bullet",
          null,
          null,
          null,
          false
        );
        for (i = 0; i < p_return.v_data.length; i++) {
          node.createChildNode(
            p_return.v_data[i][3] + " <i class='fas node-all fa-arrow-right'></i> " + p_return.v_data[i][4],
            false,
            "fas node-all fa-columns node-column",
            null,
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackMariaDB(node);
      },
      function(p_return) {
        nodeOpenErrorMariadb(p_return, node);
      },
      "box",
      false
    );
  }
  function getFunctionsMariadb(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_functions_mariadb/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: node.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Functions (" + p_return.v_data.length + ")");
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-cog node-function",
            {
              type: "function",
              id: p_return.v_data[i].v_id,
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_function",
            null,
            false
          );
          v_node.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "function_field"
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackMariaDB(node);
      },
      function(p_return) {
        nodeOpenErrorMariadb(p_return, node);
      },
      "box",
      false
    );
  }
  function getFunctionFieldsMariadb(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_function_fields_mariadb/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_function: node.tag.id,
        p_schema: node.parent.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          if (p_return.v_data[i].v_type == "O")
            v_node = node.createChildNode(
              p_return.v_data[i].v_name,
              false,
              "fas node-all fa-arrow-right node-function-field",
              null,
              null,
              null,
              false
            );
          else {
            if (p_return.v_data[i].v_type == "I")
              v_node = node.createChildNode(
                p_return.v_data[i].v_name,
                false,
                "fas node-all fa-arrow-left node-function-field",
                null,
                null,
                null,
                false
              );
            else
              v_node = node.createChildNode(
                p_return.v_data[i].v_name,
                false,
                "fas node-all fa-exchange-alt node-function-field",
                null,
                null,
                null,
                false
              );
          }
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackMariaDB(node);
      },
      function(p_return) {
        nodeOpenErrorMariadb(p_return, node);
      },
      "box",
      false
    );
  }
  function getFunctionDefinitionMariadb(node) {
    execAjax(
      "/get_function_definition_mariadb/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_function: node.tag.id
      }),
      function(p_return) {
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data);
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
        renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);
        var v_div_result = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;
        if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht != null) {
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht.destroy();
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht = null;
        }
        v_div_result.innerHTML = "";
        maximizeEditor();
      },
      function(p_return) {
        nodeOpenErrorMariadb(p_return, node);
      },
      "box",
      true
    );
  }
  function getProceduresMariadb(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_procedures_mariadb/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: node.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Procedures (" + p_return.v_data.length + ")");
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-cog node-procedure",
            {
              type: "procedure",
              id: p_return.v_data[i].v_id,
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_procedure",
            null,
            false
          );
          v_node.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "procedure_field",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackMariaDB(node);
      },
      function(p_return) {
        nodeOpenErrorMariadb(p_return, node);
      },
      "box",
      false
    );
  }
  function getProcedureFieldsMariadb(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_procedure_fields_mariadb/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_procedure: node.tag.id,
        p_schema: node.parent.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          if (p_return.v_data[i].v_type == "O")
            v_node = node.createChildNode(
              p_return.v_data[i].v_name,
              false,
              "fas node-all fa-arrow-right node-function-field",
              null,
              null,
              null,
              false
            );
          else {
            if (p_return.v_data[i].v_type == "I")
              v_node = node.createChildNode(
                p_return.v_data[i].v_name,
                false,
                "fas node-all fa-arrow-left node-function-field",
                null,
                null,
                null,
                false
              );
            else
              v_node = node.createChildNode(
                p_return.v_data[i].v_name,
                false,
                "fas node-all fa-exchange-alt node-function-field",
                null,
                null,
                null,
                false
              );
          }
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackMariaDB(node);
      },
      function(p_return) {
        nodeOpenErrorMariadb(p_return, node);
      },
      "box",
      false
    );
  }
  function getProcedureDefinitionMariadb(node) {
    execAjax(
      "/get_procedure_definition_mariadb/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_procedure: node.tag.id
      }),
      function(p_return) {
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data);
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
        renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);
        var v_div_result = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;
        if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht != null) {
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht.destroy();
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht = null;
        }
        v_div_result.innerHTML = "";
        maximizeEditor();
      },
      function(p_return) {
        nodeOpenErrorMariadb(p_return, node);
      },
      "box",
      true
    );
  }
  function TemplateSelectMariadb(p_schema, p_table) {
    execAjax(
      "/template_select_mariadb/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table,
        p_schema
      }),
      function(p_return) {
        v_connTabControl.tag.createQueryTab(p_schema + "." + p_table);
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data.v_template);
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
        renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, p_schema + "." + p_table);
        querySQL(0);
      },
      function(p_return) {
        showError(p_return.v_data);
        return "";
      },
      "box",
      true
    );
  }
  function TemplateInsertMariadb(p_schema, p_table) {
    execAjax(
      "/template_insert_mariadb/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table,
        p_schema
      }),
      function(p_return) {
        tabSQLTemplate("Insert " + p_schema + "." + p_table, p_return.v_data.v_template);
      },
      function(p_return) {
        showError(p_return.v_data);
        return "";
      },
      "box",
      true
    );
  }
  function TemplateUpdateMariadb(p_schema, p_table) {
    execAjax(
      "/template_update_mariadb/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table,
        p_schema
      }),
      function(p_return) {
        tabSQLTemplate("Update " + p_schema + "." + p_table, p_return.v_data.v_template);
      },
      function(p_return) {
        showError(p_return.v_data);
        return "";
      },
      "box",
      true
    );
  }
  function nodeOpenErrorMariadb(p_return, p_node) {
    if (p_return.v_data.password_timeout) {
      p_node.collapseNode();
      showPasswordPrompt(
        v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        function() {
          p_node.expandNode();
        },
        null,
        p_return.v_data.message
      );
    } else {
      if (p_node.childNodes.length > 0) p_node.removeChildNodes();
      v_node = p_node.createChildNode(
        "Error - <a class='a_link' onclick='showError(&quot;" + p_return.v_data.replace(/\n/g, "<br/>").replace(/"/g, "") + "&quot;)'>View Detail</a>",
        false,
        "fas fa-times node-error",
        {
          type: "error",
          message: p_return.v_data
        },
        null
      );
    }
  }
  function getMajorVersionMariadb(p_version) {
    var v_version = p_version.split("-")[0];
    var tmp2 = v_version.replace("MariaDB ", "").split(".");
    tmp2.pop();
    return tmp2.join(".");
  }
  function mariadbTerminateBackendConfirm(p_pid) {
    execAjax(
      "/kill_backend_mariadb/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_pid
      }),
      function(p_return) {
        refreshMonitoring();
      },
      function(p_return) {
        if (p_return.v_data.password_timeout) {
          showPasswordPrompt(
            v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
            function() {
              mariadbTerminateBackendConfirm(p_pid);
            },
            null,
            p_return.v_data.message
          );
        } else {
          showError(p_return.v_data);
        }
      },
      "box",
      true
    );
  }
  function mariadbTerminateBackend(p_row) {
    showConfirm("Are you sure you want to terminate process " + p_row[0] + "?", function() {
      mariadbTerminateBackendConfirm(p_row[0]);
    });
  }
  const treeMariadb = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    TemplateInsertMariadb,
    TemplateSelectMariadb,
    TemplateUpdateMariadb,
    afterNodeOpenedCallbackMariaDB,
    getColumnsMariadb,
    getDatabaseObjectsMariadb,
    getDatabasesMariadb,
    getFKsColumnsMariadb,
    getFKsMariadb,
    getFunctionDefinitionMariadb,
    getFunctionFieldsMariadb,
    getFunctionsMariadb,
    getIndexesColumnsMariadb,
    getIndexesMariadb,
    getMajorVersionMariadb,
    getPKColumnsMariadb,
    getPKMariadb,
    getProcedureDefinitionMariadb,
    getProcedureFieldsMariadb,
    getProceduresMariadb,
    getPropertiesMariadb,
    getRolesMariadb,
    getSequencesMariadb,
    getTablesMariadb,
    getTreeDetailsMariadb,
    getTreeMariadb,
    getUniquesColumnsMariadb,
    getUniquesMariadb,
    getViewDefinitionMariadb,
    getViewsColumnsMariadb,
    getViewsMariadb,
    mariadbTerminateBackend,
    mariadbTerminateBackendConfirm,
    nodeOpenErrorMariadb,
    refreshTreeMariadb
  }, Symbol.toStringTag, { value: "Module" }));
  function getTreeMysql(p_div) {
    var context_menu = {
      cm_server: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMysql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          }
        ]
      },
      cm_databases: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMysql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Database",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate("Create Database", node.tree.tag.create_database);
            }
          }
        ]
      },
      cm_database: {
        elements: [
          {
            text: "Render Graph",
            icon: "fab cm-all fa-hubspot",
            action: function(node) {
            },
            submenu: {
              elements: [
                {
                  text: "Simple Graph",
                  icon: "fab cm-all fa-hubspot",
                  action: function(node) {
                    v_connTabControl.tag.createGraphTab(node.text);
                    drawGraph(false, node.text);
                  }
                },
                {
                  text: "Complete Graph",
                  icon: "fab cm-all fa-hubspot",
                  action: function(node) {
                    v_connTabControl.tag.createGraphTab(node.text);
                    drawGraph(true, node.text);
                  }
                }
              ]
            }
          },
          {
            text: "Alter Database",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate("Alter Database", node.tree.tag.alter_database.replace("#database_name#", node.text));
            }
          },
          {
            text: "Drop Database",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate("Drop Database", node.tree.tag.drop_database.replace("#database_name#", node.text));
            }
          }
        ]
      },
      cm_roles: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMysql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Role",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate("Create Role", node.tree.tag.create_role);
            }
          }
        ]
      },
      cm_role: {
        elements: [
          {
            text: "Alter Role",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate("Alter Role", node.tree.tag.alter_role.replace("#role_name#", node.text));
            }
          },
          {
            text: "Drop Role",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate("Drop Role", node.tree.tag.drop_role.replace("#role_name#", node.text));
            }
          }
        ]
      },
      cm_tables: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMysql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Table",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate("Create Table", node.tree.tag.create_table.replace("#schema_name#", node.parent.text));
            }
          }
        ]
      },
      cm_table: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMysql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Data Actions",
            icon: "fas cm-all fa-list",
            submenu: {
              elements: [
                {
                  text: "Query Data",
                  icon: "fas cm-all fa-search",
                  action: function(node) {
                    TemplateSelectMysql(node.parent.parent.text, node.text);
                  }
                },
                {
                  text: "Edit Data",
                  icon: "fas cm-all fa-table",
                  action: function(node) {
                    v_startEditData(node.text, node.parent.parent.text);
                  }
                },
                {
                  text: "Insert Record",
                  icon: "fas cm-all fa-edit",
                  action: function(node) {
                    TemplateInsertMysql(node.parent.parent.text, node.text);
                  }
                },
                {
                  text: "Update Records",
                  icon: "fas cm-all fa-edit",
                  action: function(node) {
                    TemplateUpdateMysql(node.parent.parent.text, node.text);
                  }
                },
                {
                  text: "Delete Records",
                  icon: "fas cm-all fa-times",
                  action: function(node) {
                    tabSQLTemplate(
                      "Delete Records",
                      node.tree.tag.delete.replace("#table_name#", node.parent.parent.text + "." + node.text)
                    );
                  }
                }
              ]
            }
          },
          {
            text: "Table Actions",
            icon: "fas cm-all fa-list",
            submenu: {
              elements: [
                {
                  text: "Alter Table",
                  icon: "fas cm-all fa-table",
                  action: function(node) {
                    startAlterTable(true, "alter", node.text, node.parent.parent.text);
                  }
                },
                {
                  text: "Alter Table (SQL)",
                  icon: "fas cm-all fa-edit",
                  action: function(node) {
                    tabSQLTemplate(
                      "Alter Table",
                      node.tree.tag.alter_table.replace("#table_name#", node.parent.parent.text + "." + node.text)
                    );
                  }
                },
                {
                  text: "Drop Table",
                  icon: "fas cm-all fa-times",
                  action: function(node) {
                    tabSQLTemplate(
                      "Drop Table",
                      node.tree.tag.drop_table.replace("#table_name#", node.parent.parent.text + "." + node.text)
                    );
                  }
                }
              ]
            }
          }
        ]
      },
      cm_columns: {
        elements: [
          {
            text: "Create Column",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate(
                "Create Field",
                node.tree.tag.create_column.replace(
                  "#table_name#",
                  node.parent.parent.parent.text + "." + node.parent.text
                )
              );
            }
          }
        ]
      },
      cm_column: {
        elements: [
          {
            text: "Alter Column",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate(
                "Alter Column",
                node.tree.tag.alter_column.replace("#table_name#", node.parent.parent.parent.parent.text + "." + node.parent.parent.text).replace(/#column_name#/g, node.text)
              );
            }
          },
          {
            text: "Drop Column",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate(
                "Drop Column",
                node.tree.tag.drop_column.replace("#table_name#", node.parent.parent.parent.parent.text + "." + node.parent.parent.text).replace(/#column_name#/g, node.text)
              );
            }
          }
        ]
      },
      cm_pks: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMysql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Primary Key",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate(
                "Create Primary Key",
                node.tree.tag.create_primarykey.replace(
                  "#table_name#",
                  node.parent.parent.parent.text + "." + node.parent.text
                )
              );
            }
          }
        ]
      },
      cm_pk: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMysql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Drop Primary Key",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate(
                "Drop Primary Key",
                node.tree.tag.drop_primarykey.replace("#table_name#", node.parent.parent.parent.parent.text + "." + node.parent.parent.text).replace("#constraint_name#", node.text)
              );
            }
          }
        ]
      },
      cm_fks: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMysql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Foreign Key",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate(
                "Create Foreign Key",
                node.tree.tag.create_foreignkey.replace(
                  "#table_name#",
                  node.parent.parent.parent.text + "." + node.parent.text
                )
              );
            }
          }
        ]
      },
      cm_fk: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMysql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Drop Foreign Key",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate(
                "Drop Foreign Key",
                node.tree.tag.drop_foreignkey.replace("#table_name#", node.parent.parent.parent.parent.text + "." + node.parent.parent.text).replace("#constraint_name#", node.text)
              );
            }
          }
        ]
      },
      cm_uniques: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMysql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Unique",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate(
                "Create Unique",
                node.tree.tag.create_unique.replace(
                  "#table_name#",
                  node.parent.parent.parent.text + "." + node.parent.text
                )
              );
            }
          }
        ]
      },
      cm_unique: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMysql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Drop Unique",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate(
                "Drop Unique",
                node.tree.tag.drop_unique.replace("#table_name#", node.parent.parent.parent.parent.text + "." + node.parent.parent.text).replace("#constraint_name#", node.text)
              );
            }
          }
        ]
      },
      cm_indexes: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMysql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Index",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate(
                "Create Index",
                node.tree.tag.create_index.replace(
                  "#table_name#",
                  node.parent.parent.parent.text + "." + node.parent.text
                )
              );
            }
          }
        ]
      },
      cm_index: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMysql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Drop Index",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate(
                "Drop Index",
                node.tree.tag.drop_index.replace(
                  "#index_name#",
                  node.parent.parent.parent.parent.text + "." + node.text.replace(" (Unique)", "").replace(" (Non Unique)", "")
                )
              );
            }
          }
        ]
      },
      cm_views: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMysql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create View",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate("Create View", node.tree.tag.create_view.replace("#schema_name#", node.parent.text));
            }
          }
        ]
      },
      cm_view: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMysql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Query Data",
            icon: "fas cm-all fa-search",
            action: function(node) {
              var v_table_name = "";
              v_table_name = node.parent.parent.text + "." + node.text;
              v_connTabControl.tag.createQueryTab(node.text);
              v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(
                "-- Querying Data\nselect t.*\nfrom " + v_table_name + " t"
              );
              v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
              renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);
              querySQL(0);
            }
          },
          {
            text: "Edit View",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              v_connTabControl.tag.createQueryTab(node.text);
              getViewDefinitionMysql(node);
            }
          },
          {
            text: "Drop View",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate(
                "Drop View",
                node.tree.tag.drop_view.replace("#view_name#", node.parent.parent.text + "." + node.text)
              );
            }
          }
        ]
      },
      /*'cm_triggers': {
      	elements: [{
      		text: 'Refresh',
      		icon: 'fas cm-all fa-sync-alt',
      		action: function(node) {
      			if (node.childNodes == 0)
      				refreshTreeMysql(node);
      			else {
      				node.collapseNode();
      				node.expandNode();
      			}
      		},
      	}, {
      		text: 'Create Trigger',
      		icon: 'fas cm-all fa-edit',
      		action: function(node) {
      			tabSQLTemplate('Create Trigger', node.tree.tag
      				.create_trigger.replace(
      					'#table_name#', node.tree.tag.v_database + '.' + node.parent
      					.text));
      		}
      	}, {
      		text: 'Doc: Triggers',
      		icon: 'fas cm-all fa-globe-americas',
      		action: function(node) {
      			v_connTabControl.tag.createWebsiteTab(
      				'Documentation: Triggers',
      				'https://www.postgresql.org/docs/' +
      				getMajorVersionMysql(node.tree.tag.version) +
      				'/static/trigger-definition.html');
      		}
      	}]
      },
      'cm_view_triggers': {
      	elements: [{
      		text: 'Refresh',
      		icon: 'fas cm-all fa-sync-alt',
      		action: function(node) {
      			if (node.childNodes == 0)
      				refreshTreeMysql(node);
      			else {
      				node.collapseNode();
      				node.expandNode();
      			}
      		},
      	}, {
      		text: 'Create Trigger',
      		icon: 'fas cm-all fa-edit',
      		action: function(node) {
      			tabSQLTemplate('Create Trigger', node.tree.tag
      				.create_view_trigger.replace(
      					'#table_name#', node.tree.tag.v_database + '.' + node.parent
      					.text));
      		}
      	}, {
      		text: 'Doc: Triggers',
      		icon: 'fas cm-all fa-globe-americas',
      		action: function(node) {
      			v_connTabControl.tag.createWebsiteTab(
      				'Documentation: Triggers',
      				'https://www.postgresql.org/docs/' +
      				getMajorVersionMysql(node.tree.tag.version) +
      				'/static/trigger-definition.html');
      		}
      	}]
      },
      'cm_trigger': {
      	elements: [{
      		text: 'Alter Trigger',
      		icon: 'fas cm-all fa-edit',
      		action: function(node) {
      			tabSQLTemplate('Alter Trigger', node.tree.tag
      				.alter_trigger.replace(
      					'#table_name#', node.tree.tag.v_database + '.' +
      					node.parent.parent.text).replace(
      					'#trigger_name#', node.text));
      		}
      	}, {
      		text: 'Enable Trigger',
      		icon: 'fas cm-all fa-edit',
      		action: function(node) {
      			tabSQLTemplate('Enable Trigger', node.tree.tag
      				.enable_trigger.replace(
      					'#table_name#', node.tree.tag.v_database + '.' +
      					node.parent.parent.text).replace(
      					'#trigger_name#', node.text));
      		}
      	}, {
      		text: 'Disable Trigger',
      		icon: 'fas cm-all fa-edit',
      		action: function(node) {
      			tabSQLTemplate('Disable Trigger', node.tree
      				.tag.disable_trigger.replace(
      					'#table_name#', node.tree.tag.v_database + '.' +
      					node.parent.parent.text).replace(
      					'#trigger_name#', node.text));
      		}
      	}, {
      		text: 'Drop Trigger',
      		icon: 'fas cm-all fa-times',
      		action: function(node) {
      			tabSQLTemplate('Drop Trigger', node.tree.tag
      				.drop_trigger.replace(
      					'#table_name#', node.tree.tag.v_database + '.' +
      					node.parent.parent.text).replace(
      					'#trigger_name#', node.text));
      		}
      	}]
      },
      'cm_partitions': {
      	elements: [{
      		text: 'Refresh',
      		icon: 'fas cm-all fa-sync-alt',
      		action: function(node) {
      			if (node.childNodes == 0)
      				refreshTreeMysql(node);
      			else {
      				node.collapseNode();
      				node.expandNode();
      			}
      		}
      	}, {
      		text: 'Create Partition',
      		icon: 'fas cm-all fa-edit',
      		action: function(node) {
      			tabSQLTemplate('Create Partition', node.tree
      				.tag.create_partition.replace(
      					'#table_name#', node.tree.tag.v_database + '.' + node.parent
      					.text));
      		}
      	}, {
      		text: 'Doc: Partitions',
      		icon: 'fas cm-all fa-globe-americas',
      		action: function(node) {
      			v_connTabControl.tag.createWebsiteTab(
      				'Documentation: Partitions',
      				'https://www.postgresql.org/docs/' +
      				getMajorVersionMysql(node.tree.tag.version) +
      				'/static/ddl-partitioning.html');
      		}
      	}]
      },
      'cm_partition': {
      	elements: [{
      		text: 'No Inherit Partition',
      		icon: 'fas cm-all fa-edit',
      		action: function(node) {
      			tabSQLTemplate('No Inherit Partition', node
      				.tree.tag.noinherit_partition.replace(
      					'#table_name#', node.tree.tag.v_database + '.' +
      					node.parent.parent.text).replace(
      					'#partition_name#', node.text));
      		}
      	}, {
      		text: 'Drop Partition',
      		icon: 'fas cm-all fa-times',
      		action: function(node) {
      			tabSQLTemplate('Drop Partition', node.tree.tag
      				.drop_partition.replace(
      					'#partition_name#', node.text));
      		}
      	}]
      },*/
      cm_functions: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMysql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Function",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate("Create Function", node.tree.tag.create_function.replace("#schema_name#", node.parent.text));
            }
          }
        ]
      },
      cm_function: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMysql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Edit Function",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              v_connTabControl.tag.createQueryTab(node.text);
              getFunctionDefinitionMysql(node);
            }
          },
          {
            text: "Drop Function",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate("Drop Function", node.tree.tag.drop_function.replace("#function_name#", node.tag.id));
            }
          }
        ]
      },
      cm_procedures: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMysql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Procedure",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate("Create Procedure", node.tree.tag.create_procedure.replace("#schema_name#", node.parent.text));
            }
          }
        ]
      },
      cm_procedure: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMysql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Edit Procedure",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              v_connTabControl.tag.createQueryTab(node.text);
              getProcedureDefinitionMysql(node);
            }
          },
          {
            text: "Drop Procedure",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate("Drop Procedure", node.tree.tag.drop_procedure.replace("#function_name#", node.tag.id));
            }
          }
        ]
      },
      cm_refresh: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) refreshTreeMysql(node);
              else {
                node.collapseNode();
                node.expandNode();
              }
            }
          }
        ]
      }
    };
    var tree = createTree(p_div, "#fcfdfd", context_menu);
    v_connTabControl.selectedTab.tag.tree = tree;
    let v_autocomplete_switch_status = v_connTabControl.selectedTab.tag.enable_autocomplete !== false ? " checked " : "";
    v_connTabControl.selectedTab.tag.divDetails.innerHTML = '<i class="fas fa-server me-1"></i>selected DB: <b>' + escapeHtml(v_connTabControl.selectedTab.tag.selectedDatabase) + '</b><div class="omnidb__switch omnidb__switch--sm float-end" data-bs-toggle="tooltip" data-bs-placement="bottom" data-bs-html="true" title="" data-bs-original-title="<h5>Toggle autocomplete.</h5><div>Switch OFF <b>disables the autocomplete</b> on the inner tabs for this connection.</div>"><input type="checkbox" ' + v_autocomplete_switch_status + ' id="autocomplete_toggler_' + v_connTabControl.selectedTab.tag.tab_id + `" class="omnidb__switch--input" onchange="toggleConnectionAutocomplete('autocomplete_toggler_` + v_connTabControl.selectedTab.tag.tab_id + `')"><label for="autocomplete_toggler_` + v_connTabControl.selectedTab.tag.tab_id + '" class="omnidb__switch--label"><span><i class="fas fa-spell-check"></i></span></label></div>';
    tree.nodeAfterOpenEvent = function(node) {
      refreshTreeMysql(node);
    };
    tree.clickNodeEvent = function(node) {
      if (v_connTabControl.selectedTab.tag.treeTabsVisible) {
        getPropertiesMysql(node);
      }
    };
    tree.beforeContextMenuEvent = function(node, callback) {
      var v_elements = [];
      if (v_connTabControl.tag.hooks.mysqlTreeContextMenu.length > 0) {
        for (var i2 = 0; i2 < v_connTabControl.tag.hooks.mysqlTreeContextMenu.length; i2++)
          v_elements = v_elements.concat(v_connTabControl.tag.hooks.mysqlTreeContextMenu[i2](node));
      }
      var v_customCallback = function() {
        callback(v_elements);
      };
      v_customCallback();
    };
    var node_server = tree.createNode(
      "MySQL",
      false,
      "node-mysql",
      null,
      {
        type: "server"
      },
      "cm_server"
    );
    node_server.createChildNode("", true, "node-spin", null, null);
    tree.drawTree();
  }
  function getPropertiesMysql(node) {
    if (node.tag != void 0)
      if (node.tag.type == "table") {
        getProperties("/get_properties_mysql/", {
          p_schema: node.parent.parent.text,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "view") {
        getProperties("/get_properties_mysql/", {
          p_schema: node.parent.parent.text,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "function") {
        getProperties("/get_properties_mysql/", {
          p_schema: node.parent.parent.text,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "procedure") {
        getProperties("/get_properties_mysql/", {
          p_schema: node.parent.parent.text,
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else {
        clearProperties();
      }
    if (v_connTabControl.tag.hooks.mysqlTreeNodeClick.length > 0) {
      for (var i2 = 0; i2 < v_connTabControl.tag.hooks.mysqlTreeNodeClick.length; i2++)
        v_connTabControl.tag.hooks.mysqlTreeNodeClick[i2](node);
    }
  }
  function refreshTreeMysql(node) {
    if (node.tag != void 0)
      if (node.tag.type == "table_list") {
        getTablesMysql(node);
      } else if (node.tag.type == "table") {
        getColumnsMysql(node);
      } else if (node.tag.type == "primary_key") {
        getPKMysql(node);
      } else if (node.tag.type == "pk") {
        getPKColumnsMysql(node);
      } else if (node.tag.type == "uniques") {
        getUniquesMysql(node);
      } else if (node.tag.type == "unique") {
        getUniquesColumnsMysql(node);
      } else if (node.tag.type == "foreign_keys") {
        getFKsMysql(node);
      } else if (node.tag.type == "foreign_key") {
        getFKsColumnsMysql(node);
      } else if (node.tag.type == "view_list") {
        getViewsMysql(node);
      } else if (node.tag.type == "view") {
        getViewsColumnsMysql(node);
      } else if (node.tag.type == "indexes") {
        getIndexesMysql(node);
      } else if (node.tag.type == "index") {
        getIndexesColumnsMysql(node);
      } else if (node.tag.type == "function_list") {
        getFunctionsMysql(node);
      } else if (node.tag.type == "function") {
        getFunctionFieldsMysql(node);
      } else if (node.tag.type == "procedure_list") {
        getProceduresMysql(node);
      } else if (node.tag.type == "procedure") {
        getProcedureFieldsMysql(node);
      } else if (node.tag.type == "database_list") {
        getDatabasesMysql(node);
      } else if (node.tag.type == "database") {
        getDatabaseObjectsMysql(node);
      } else if (node.tag.type == "role_list") {
        getRolesMysql(node);
      } else if (node.tag.type == "server") {
        getTreeDetailsMysql(node);
      } else {
        afterNodeOpenedCallbackMysql(node);
      }
  }
  function afterNodeOpenedCallbackMysql(node) {
    if (v_connTabControl.tag.hooks.mysqlTreeNodeOpen.length > 0) {
      for (var i2 = 0; i2 < v_connTabControl.tag.hooks.mysqlTreeNodeOpen.length; i2++)
        v_connTabControl.tag.hooks.mysqlTreeNodeOpen[i2](node);
    }
  }
  function getTreeDetailsMysql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_tree_info_mysql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id
      }),
      function(p_return) {
        node.tree.contextMenu.cm_server.elements = [];
        node.tree.contextMenu.cm_server.elements.push({
          text: "Refresh",
          icon: "fas cm-all fa-sync-alt",
          action: function(node2) {
            if (node2.childNodes == 0) refreshTreeMysql(node2);
            else {
              node2.collapseNode();
              node2.expandNode();
            }
          }
        });
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.tree.tag = {
          v_database: p_return.v_data.v_database_return.v_database,
          version: p_return.v_data.v_database_return.version,
          v_username: p_return.v_data.v_database_return.v_username,
          superuser: p_return.v_data.v_database_return.superuser,
          create_role: p_return.v_data.v_database_return.create_role,
          alter_role: p_return.v_data.v_database_return.alter_role,
          drop_role: p_return.v_data.v_database_return.drop_role,
          create_database: p_return.v_data.v_database_return.create_database,
          alter_database: p_return.v_data.v_database_return.alter_database,
          drop_database: p_return.v_data.v_database_return.drop_database,
          create_function: p_return.v_data.v_database_return.create_function,
          drop_function: p_return.v_data.v_database_return.drop_function,
          create_procedure: p_return.v_data.v_database_return.create_procedure,
          drop_procedure: p_return.v_data.v_database_return.drop_procedure,
          //create_triggerfunction: p_return.v_data.v_database_return
          //    .create_triggerfunction,
          //drop_triggerfunction: p_return.v_data.v_database_return
          //    .drop_triggerfunction,
          create_view: p_return.v_data.v_database_return.create_view,
          drop_view: p_return.v_data.v_database_return.drop_view,
          create_table: p_return.v_data.v_database_return.create_table,
          alter_table: p_return.v_data.v_database_return.alter_table,
          drop_table: p_return.v_data.v_database_return.drop_table,
          create_column: p_return.v_data.v_database_return.create_column,
          alter_column: p_return.v_data.v_database_return.alter_column,
          drop_column: p_return.v_data.v_database_return.drop_column,
          create_primarykey: p_return.v_data.v_database_return.create_primarykey,
          drop_primarykey: p_return.v_data.v_database_return.drop_primarykey,
          create_unique: p_return.v_data.v_database_return.create_unique,
          drop_unique: p_return.v_data.v_database_return.drop_unique,
          create_foreignkey: p_return.v_data.v_database_return.create_foreignkey,
          drop_foreignkey: p_return.v_data.v_database_return.drop_foreignkey,
          create_index: p_return.v_data.v_database_return.create_index,
          drop_index: p_return.v_data.v_database_return.drop_index,
          //create_trigger: p_return.v_data.v_database_return.create_trigger,
          //create_view_trigger: p_return.v_data.v_database_return.create_view_trigger,
          //alter_trigger: p_return.v_data.v_database_return.alter_trigger,
          //enable_trigger: p_return.v_data.v_database_return.enable_trigger,
          //disable_trigger: p_return.v_data.v_database_return.disable_trigger,
          //drop_trigger: p_return.v_data.v_database_return.drop_trigger,
          //create_partition: p_return.v_data.v_database_return.create_partition,
          //noinherit_partition: p_return.v_data.v_database_return.noinherit_partition,
          //drop_partition: p_return.v_data.v_database_return.drop_partition
          delete: p_return.v_data.v_database_return.delete
        };
        node.tree.contextMenu.cm_server.elements.push({
          text: "Monitoring",
          icon: "fas cm-all fa-chart-line",
          action: function(node2) {
          },
          submenu: {
            elements: [
              /*{
              	text: 'Dashboard',
              	icon: 'fas cm-all fa-chart-line',
              	action: function(node) {
              		v_connTabControl.tag.createMonitorDashboardTab();
              		startMonitorDashboard();
              	}
              }, */
              {
                text: "Process List",
                icon: "fas cm-all fa-chart-line",
                action: function(node2) {
                  v_connTabControl.tag.createMonitoringTab(
                    "Process List",
                    "select * from information_schema.processlist",
                    [
                      {
                        icon: "fas cm-all fa-times",
                        title: "Terminate",
                        action: "mysqlTerminateBackend"
                      }
                    ]
                  );
                }
              }
            ]
          }
        });
        node.setText(p_return.v_data.v_database_return.version);
        var node_databases = node.createChildNode(
          "Databases",
          false,
          "fas node-all fa-database node-database-list",
          {
            type: "database_list",
            num_databases: 0
          },
          "cm_databases"
        );
        node_databases.createChildNode("", true, "node-spin", null, null);
        if (node.tree.tag.superuser) {
          var node_roles = node.createChildNode(
            "Roles",
            false,
            "fas node-all fa-users node-user-list",
            {
              type: "role_list",
              num_roles: 0
            },
            "cm_roles"
          );
          node_roles.createChildNode("", true, "node-spin", null, null);
        }
        if (v_connTabControl.selectedTab.tag.firstTimeOpen) {
          v_connTabControl.selectedTab.tag.firstTimeOpen = false;
        }
        afterNodeOpenedCallbackMysql(node);
      },
      function(p_return) {
        nodeOpenErrorMysql(p_return, node);
      },
      "box",
      false
    );
  }
  function getDatabaseObjectsMysql(node) {
    node.removeChildNodes();
    var node_tables = node.createChildNode(
      "Tables",
      false,
      "fas node-all fa-th node-table-list",
      {
        type: "table_list",
        num_tables: 0,
        database: v_connTabControl.selectedTab.tag.selectedDatabase
      },
      "cm_tables"
    );
    node_tables.createChildNode("", true, "node-spin", null, null);
    var node_views = node.createChildNode(
      "Views",
      false,
      "fas node-all fa-eye node-view-list",
      {
        type: "view_list",
        num_views: 0,
        database: v_connTabControl.selectedTab.tag.selectedDatabase
      },
      "cm_views"
    );
    node_views.createChildNode("", true, "node-spin", null, null);
    var node_functions = node.createChildNode(
      "Functions",
      false,
      "fas node-all fa-cog node-function-list",
      {
        type: "function_list",
        num_functions: 0,
        database: v_connTabControl.selectedTab.tag.selectedDatabase
      },
      "cm_functions"
    );
    node_functions.createChildNode("", true, "node-spin", null, null);
    var node_functions = node.createChildNode(
      "Procedures",
      false,
      "fas node-all fa-cog node-procedure-list",
      {
        type: "procedure_list",
        num_functions: 0,
        database: v_connTabControl.selectedTab.tag.selectedDatabase
      },
      "cm_procedures"
    );
    node_functions.createChildNode("", true, "node-spin", null, null);
    afterNodeOpenedCallbackMysql(node);
  }
  function getDatabasesMysql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_databases_mysql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Databases (" + p_return.v_data.length + ")");
        node.tag.num_databases = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          var v_node2 = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-database node-database",
            {
              type: "database",
              database: p_return.v_data[i].v_name.replace(/"/g, "")
            },
            "cm_database",
            null,
            false
          );
          if (v_connTabControl.selectedTab.tag.selectedDatabase == p_return.v_data[i].v_name.replace(/"/g, "")) {
            v_node2.setNodeBold();
            v_connTabControl.selectedTab.tag.selectedDatabaseNode = v_node2;
          }
          v_node2.createChildNode("", true, "node-spin", null, null, null, false);
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackMysql(node);
      },
      function(p_return) {
        nodeOpenErrorMysql(p_return, node);
      },
      "box",
      false
    );
  }
  function getRolesMysql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_roles_mysql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Roles (" + p_return.v_data.length + ")");
        node.tag.num_tablespaces = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-user node-user",
            {
              type: "role",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_role",
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackMysql(node);
      },
      function(p_return) {
        nodeOpenErrorMysql(p_return, node);
      },
      "box",
      false
    );
  }
  function getTablesMysql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_tables_mysql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: node.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Tables (" + p_return.v_data.length + ")");
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-table node-table",
            {
              type: "table",
              has_primary_keys: p_return.v_data[i].v_has_primary_keys,
              has_foreign_keys: p_return.v_data[i].v_has_foreign_keys,
              has_uniques: p_return.v_data[i].v_has_uniques,
              has_indexes: p_return.v_data[i].v_has_indexes,
              has_checks: p_return.v_data[i].v_has_checks,
              has_excludes: p_return.v_data[i].v_has_excludes,
              has_rules: p_return.v_data[i].v_has_rules,
              has_triggers: p_return.v_data[i].v_has_triggers,
              has_partitions: p_return.v_data[i].v_has_partitions,
              has_statistics: p_return.v_data[i].v_has_statistics,
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_table",
            null,
            false
          );
          v_node.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "table_field",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackMysql(node);
      },
      function(p_return) {
        nodeOpenErrorMysql(p_return, node);
      },
      "box",
      false
    );
  }
  function getViewsMysql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_views_mysql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: node.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Views (" + p_return.v_data.length + ")");
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-eye node-view",
            {
              type: "view",
              has_triggers: p_return.v_data[i].v_has_triggers,
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_view",
            null,
            false
          );
          v_node.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "view_field",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackMysql(node);
      },
      function(p_return) {
        nodeOpenErrorMysql(p_return, node);
      },
      "box",
      false
    );
  }
  function getViewsColumnsMysql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_views_columns_mysql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.text,
        p_schema: node.parent.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        v_list = node.createChildNode(
          "Columns (" + p_return.v_data.length + ")",
          false,
          "fas node-all fa-columns node-column",
          null,
          null,
          null,
          false
        );
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = v_list.createChildNode(
            p_return.v_data[i].v_column_name,
            false,
            "fas node-all fa-columns node-column",
            {
              type: "table_field",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
          v_node.createChildNode(
            "Type: " + p_return.v_data[i].v_data_type,
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            null,
            null,
            null,
            false
          );
        }
        if (node.tag.has_rules) {
          v_node = node.createChildNode(
            "Rules",
            false,
            "fas node-all fa-lightbulb node-rule",
            {
              type: "rule_list",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_rules",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_triggers) {
          v_node = node.createChildNode(
            "Triggers",
            false,
            "fas node-all fa-bolt node-trigger",
            {
              type: "trigger_list",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_view_triggers",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackMysql(node);
      },
      function(p_return) {
        nodeOpenErrorMysql(p_return, node);
      },
      "box",
      false
    );
  }
  function getViewDefinitionMysql(node) {
    execAjax(
      "/get_view_definition_mysql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_view: node.text,
        p_schema: node.parent.parent.text
      }),
      function(p_return) {
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data);
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
        renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);
        var v_div_result = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;
        if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht != null) {
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht.destroy();
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht = null;
        }
        v_div_result.innerHTML = "";
        maximizeEditor();
      },
      function(p_return) {
        nodeOpenErrorMysql(p_return, node);
      },
      "box",
      true
    );
  }
  function getColumnsMysql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_columns_mysql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.text,
        p_schema: node.parent.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        v_list = node.createChildNode(
          "Columns (" + p_return.v_data.length + ")",
          false,
          "fas node-all fa-columns node-column",
          {
            type: "column_list",
            database: v_connTabControl.selectedTab.tag.selectedDatabase
          },
          "cm_columns",
          null,
          false
        );
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = v_list.createChildNode(
            p_return.v_data[i].v_column_name,
            false,
            "fas node-all fa-columns node-column",
            {
              type: "table_field",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_column",
            null,
            false
          );
          v_node.createChildNode(
            "Type: " + p_return.v_data[i].v_data_type,
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            null,
            null,
            null,
            false
          );
          v_node.createChildNode(
            "Nullable: " + p_return.v_data[i].v_nullable,
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            null,
            null,
            null,
            false
          );
        }
        if (node.tag.has_primary_keys) {
          v_node = node.createChildNode(
            "Primary Key",
            false,
            "fas node-all fa-key node-pkey",
            {
              type: "primary_key",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_pks",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_foreign_keys) {
          v_node = node.createChildNode(
            "Foreign Keys",
            false,
            "fas node-all fa-key node-fkey",
            {
              type: "foreign_keys",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_fks",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_uniques) {
          v_node = node.createChildNode(
            "Uniques",
            false,
            "fas node-all fa-key node-unique",
            {
              type: "uniques",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_uniques",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_indexes) {
          v_node = node.createChildNode(
            "Indexes",
            false,
            "fas node-all fa-thumbtack node-index",
            {
              type: "indexes",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_indexes",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_triggers) {
          v_node = node.createChildNode(
            "Triggers",
            false,
            "fas node-all fa-bolt node-trigger",
            {
              type: "trigger_list",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_triggers",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_partitions) {
          v_node = node.createChildNode(
            "Partitions",
            false,
            "fas node-all fa-table node-partition",
            {
              type: "partition_list",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_partitions",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackMysql(node);
      },
      function(p_return) {
        nodeOpenErrorMysql(p_return, node);
      },
      "box",
      false
    );
  }
  function getPKMysql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_pk_mysql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.text,
        p_schema: node.parent.parent.parent.text
      }),
      function(p_return) {
        node.setText("Primary Key (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) {
          node.removeChildNodes();
        }
        if (p_return.v_data.length > 0) {
          v_node = node.createChildNode(
            p_return.v_data[0][0],
            false,
            "fas node-all fa-key node-pkey",
            {
              type: "pk",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_pk"
          );
          v_node.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "pk_field",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null
          );
        }
        afterNodeOpenedCallbackMysql(node);
      },
      function(p_return) {
        nodeOpenErrorMysql(p_return, node);
      },
      "box",
      false
    );
  }
  function getPKColumnsMysql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_pk_columns_mysql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_key: node.text,
        p_table: node.parent.parent.text,
        p_schema: node.parent.parent.parent.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node.createChildNode(
            p_return.v_data[i][0],
            false,
            "fas node-all fa-columns node-column",
            null,
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackMysql(node);
      },
      function(p_return) {
        nodeOpenErrorMysql(p_return, node);
      },
      "box",
      false
    );
  }
  function getUniquesMysql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_uniques_mysql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.text,
        p_schema: node.parent.parent.parent.text
      }),
      function(p_return) {
        node.setText("Uniques (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) node.removeChildNodes();
        if (p_return.v_data.length > 0) {
          for (i = 0; i < p_return.v_data.length; i++) {
            v_node = node.createChildNode(
              p_return.v_data[i][0],
              false,
              "fas node-all fa-key node-unique",
              {
                type: "unique",
                database: v_connTabControl.selectedTab.tag.selectedDatabase
              },
              "cm_unique",
              null,
              false
            );
            v_node.createChildNode(
              "",
              false,
              "node-spin",
              {
                type: "unique_field",
                database: v_connTabControl.selectedTab.tag.selectedDatabase
              },
              null,
              null,
              false
            );
          }
          node.drawChildNodes();
        }
        afterNodeOpenedCallbackMysql(node);
      },
      function(p_return) {
        nodeOpenErrorMysql(p_return, node);
      },
      "box",
      false
    );
  }
  function getUniquesColumnsMysql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_uniques_columns_mysql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_unique: node.text,
        p_table: node.parent.parent.text,
        p_schema: node.parent.parent.parent.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        if (p_return.v_data.length > 0) {
          for (i = 0; i < p_return.v_data.length; i++) {
            node.createChildNode(
              p_return.v_data[i][0],
              false,
              "fas node-all fa-columns node-column",
              null,
              null,
              null,
              false
            );
          }
          node.drawChildNodes();
        }
        afterNodeOpenedCallbackMysql(node);
      },
      function(p_return) {
        nodeOpenErrorMysql(p_return, node);
      },
      "box",
      false
    );
  }
  function getIndexesMysql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_indexes_mysql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.text,
        p_schema: node.parent.parent.parent.text
      }),
      function(p_return) {
        node.setText("Indexes (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) node.removeChildNodes();
        var v_node2;
        if (p_return.v_data.length > 0) {
          for (i = 0; i < p_return.v_data.length; i++) {
            v_node2 = node.createChildNode(
              p_return.v_data[i][0] + " (" + p_return.v_data[i][1] + ")",
              false,
              "fas node-all fa-thumbtack node-index",
              {
                type: "index",
                database: v_connTabControl.selectedTab.tag.selectedDatabase
              },
              "cm_index",
              null,
              false
            );
            v_node2.createChildNode(
              "",
              false,
              "node-spin",
              {
                type: "index_field"
              },
              null,
              null,
              false
            );
          }
          node.drawChildNodes();
        }
        afterNodeOpenedCallbackMysql(node);
      },
      function(p_return) {
        nodeOpenErrorMysql(p_return, node);
      },
      "box",
      false
    );
  }
  function getIndexesColumnsMysql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_indexes_columns_mysql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_index: node.text.replace(" (Non Unique)", "").replace(" (Unique)", ""),
        p_table: node.parent.parent.text,
        p_schema: node.parent.parent.parent.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        if (p_return.v_data.length > 0) {
          for (i = 0; i < p_return.v_data.length; i++) {
            node.createChildNode(
              p_return.v_data[i][0],
              false,
              "fas node-all fa-columns node-column",
              null,
              null,
              null,
              false
            );
          }
          node.drawChildNodes();
        }
        afterNodeOpenedCallbackMysql(node);
      },
      function(p_return) {
        nodeOpenErrorMysql(p_return, node);
      },
      "box",
      false
    );
  }
  function getFKsMysql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_fks_mysql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.text,
        p_schema: node.parent.parent.parent.text
      }),
      function(p_return) {
        node.setText("Foreign Keys (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) node.removeChildNodes();
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i][0],
            false,
            "fas node-all fa-key node-fkey",
            {
              type: "foreign_key",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_fk",
            null,
            false
          );
          v_node.createChildNode(
            "Referenced Table: " + p_return.v_data[i][1],
            false,
            "fas node-all fa-table node-table",
            null,
            null,
            null,
            false
          );
          v_node.createChildNode(
            "Delete Rule: " + p_return.v_data[i][2],
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            null,
            null,
            null,
            false
          );
          v_node.createChildNode(
            "Update Rule: " + p_return.v_data[i][3],
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            null,
            null,
            null,
            false
          );
          v_curr_fk = p_return.v_data[i][0];
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackMysql(node);
      },
      function(p_return) {
        nodeOpenErrorMysql(p_return, node);
      },
      "box",
      false
    );
  }
  function getFKsColumnsMysql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_fks_columns_mysql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_fkey: node.text,
        p_table: node.parent.parent.text,
        p_schema: node.parent.parent.parent.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.createChildNode(
          "Referenced Table: " + p_return.v_data[0][0],
          false,
          "fas node-all fa-table node-table",
          null,
          null,
          null,
          false
        );
        node.createChildNode(
          "Delete Rule: " + p_return.v_data[0][1],
          false,
          "fas node-all fa-ellipsis-h node-bullet",
          null,
          null,
          null,
          false
        );
        node.createChildNode(
          "Update Rule: " + p_return.v_data[0][2],
          false,
          "fas node-all fa-ellipsis-h node-bullet",
          null,
          null,
          null,
          false
        );
        for (i = 0; i < p_return.v_data.length; i++) {
          node.createChildNode(
            p_return.v_data[i][3] + " <i class='fas node-all fa-arrow-right'></i> " + p_return.v_data[i][4],
            false,
            "fas node-all fa-columns node-column",
            null,
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackMysql(node);
      },
      function(p_return) {
        nodeOpenErrorMysql(p_return, node);
      },
      "box",
      false
    );
  }
  function getFunctionsMysql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_functions_mysql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: node.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Functions (" + p_return.v_data.length + ")");
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-cog node-function",
            {
              type: "function",
              id: p_return.v_data[i].v_id,
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_function",
            null,
            false
          );
          v_node.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "function_field"
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackMysql(node);
      },
      function(p_return) {
        nodeOpenErrorMysql(p_return, node);
      },
      "box",
      false
    );
  }
  function getFunctionFieldsMysql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_function_fields_mysql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_function: node.tag.id,
        p_schema: node.parent.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          if (p_return.v_data[i].v_type == "O")
            v_node = node.createChildNode(
              p_return.v_data[i].v_name,
              false,
              "fas node-all fa-arrow-right node-function-field",
              null,
              null,
              null,
              false
            );
          else {
            if (p_return.v_data[i].v_type == "I")
              v_node = node.createChildNode(
                p_return.v_data[i].v_name,
                false,
                "fas node-all fa-arrow-left node-function-field",
                null,
                null,
                null,
                false
              );
            else
              v_node = node.createChildNode(
                p_return.v_data[i].v_name,
                false,
                "fas node-all fa-exchange-alt node-function-field",
                null,
                null,
                null,
                false
              );
          }
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackMysql(node);
      },
      function(p_return) {
        nodeOpenErrorMysql(p_return, node);
      },
      "box",
      false
    );
  }
  function getFunctionDefinitionMysql(node) {
    execAjax(
      "/get_function_definition_mysql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_function: node.tag.id
      }),
      function(p_return) {
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data);
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
        renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);
        var v_div_result = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;
        if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht != null) {
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht.destroy();
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht = null;
        }
        v_div_result.innerHTML = "";
        maximizeEditor();
      },
      function(p_return) {
        nodeOpenErrorMysql(p_return, node);
      },
      "box",
      true
    );
  }
  function getProceduresMysql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_procedures_mysql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_schema: node.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.setText("Procedures (" + p_return.v_data.length + ")");
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-cog node-procedure",
            {
              type: "procedure",
              id: p_return.v_data[i].v_id,
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_procedure",
            null,
            false
          );
          v_node.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "procedure_field",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackMysql(node);
      },
      function(p_return) {
        nodeOpenErrorMysql(p_return, node);
      },
      "box",
      false
    );
  }
  function getProcedureFieldsMysql(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_procedure_fields_mysql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_procedure: node.tag.id,
        p_schema: node.parent.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) node.removeChildNodes();
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          if (p_return.v_data[i].v_type == "O")
            v_node = node.createChildNode(
              p_return.v_data[i].v_name,
              false,
              "fas node-all fa-arrow-right node-function-field",
              null,
              null,
              null,
              false
            );
          else {
            if (p_return.v_data[i].v_type == "I")
              v_node = node.createChildNode(
                p_return.v_data[i].v_name,
                false,
                "fas node-all fa-arrow-left node-function-field",
                null,
                null,
                null,
                false
              );
            else
              v_node = node.createChildNode(
                p_return.v_data[i].v_name,
                false,
                "fas node-all fa-exchange-alt node-function-field",
                null,
                null,
                null,
                false
              );
          }
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackMysql(node);
      },
      function(p_return) {
        nodeOpenErrorMysql(p_return, node);
      },
      "box",
      false
    );
  }
  function getProcedureDefinitionMysql(node) {
    execAjax(
      "/get_procedure_definition_mysql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_procedure: node.tag.id
      }),
      function(p_return) {
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data);
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
        renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);
        var v_div_result = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;
        if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht != null) {
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht.destroy();
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht = null;
        }
        v_div_result.innerHTML = "";
        maximizeEditor();
      },
      function(p_return) {
        nodeOpenErrorMysql(p_return, node);
      },
      "box",
      true
    );
  }
  function TemplateSelectMysql(p_schema, p_table) {
    execAjax(
      "/template_select_mysql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table,
        p_schema
      }),
      function(p_return) {
        v_connTabControl.tag.createQueryTab(p_schema + "." + p_table);
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data.v_template);
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
        renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, p_schema + "." + p_table);
        querySQL(0);
      },
      function(p_return) {
        showError(p_return.v_data);
        return "";
      },
      "box",
      true
    );
  }
  function TemplateInsertMysql(p_schema, p_table) {
    execAjax(
      "/template_insert_mysql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table,
        p_schema
      }),
      function(p_return) {
        tabSQLTemplate("Insert " + p_schema + "." + p_table, p_return.v_data.v_template);
      },
      function(p_return) {
        showError(p_return.v_data);
        return "";
      },
      "box",
      true
    );
  }
  function TemplateUpdateMysql(p_schema, p_table) {
    execAjax(
      "/template_update_mysql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table,
        p_schema
      }),
      function(p_return) {
        tabSQLTemplate("Update " + p_schema + "." + p_table, p_return.v_data.v_template);
      },
      function(p_return) {
        showError(p_return.v_data);
        return "";
      },
      "box",
      true
    );
  }
  function nodeOpenErrorMysql(p_return, p_node) {
    if (p_return.v_data.password_timeout) {
      p_node.collapseNode();
      showPasswordPrompt(
        v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        function() {
          p_node.expandNode();
        },
        null,
        p_return.v_data.message
      );
    } else {
      if (p_node.childNodes.length > 0) p_node.removeChildNodes();
      v_node = p_node.createChildNode(
        "Error - <a class='a_link' onclick='showError(&quot;" + p_return.v_data.replace(/\n/g, "<br/>").replace(/"/g, "") + "&quot;)'>View Detail</a>",
        false,
        "fas fa-times node-error",
        {
          type: "error",
          message: p_return.v_data
        },
        null
      );
    }
  }
  function mysqlTerminateBackendConfirm(p_pid) {
    execAjax(
      "/kill_backend_mysql/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_pid
      }),
      function(p_return) {
        refreshMonitoring();
      },
      function(p_return) {
        if (p_return.v_data.password_timeout) {
          showPasswordPrompt(
            v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
            function() {
              mysqlTerminateBackendConfirm(p_pid);
            },
            null,
            p_return.v_data.message
          );
        } else {
          showError(p_return.v_data);
        }
      },
      "box",
      true
    );
  }
  function mysqlTerminateBackend(p_row) {
    showConfirm("Are you sure you want to terminate process " + p_row[0] + "?", function() {
      mysqlTerminateBackendConfirm(p_row[0]);
    });
  }
  const treeMysql = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    TemplateInsertMysql,
    TemplateSelectMysql,
    TemplateUpdateMysql,
    afterNodeOpenedCallbackMysql,
    getColumnsMysql,
    getDatabaseObjectsMysql,
    getDatabasesMysql,
    getFKsColumnsMysql,
    getFKsMysql,
    getFunctionDefinitionMysql,
    getFunctionFieldsMysql,
    getFunctionsMysql,
    getIndexesColumnsMysql,
    getIndexesMysql,
    getPKColumnsMysql,
    getPKMysql,
    getProcedureDefinitionMysql,
    getProcedureFieldsMysql,
    getProceduresMysql,
    getPropertiesMysql,
    getRolesMysql,
    getTablesMysql,
    getTreeDetailsMysql,
    getTreeMysql,
    getUniquesColumnsMysql,
    getUniquesMysql,
    getViewDefinitionMysql,
    getViewsColumnsMysql,
    getViewsMysql,
    mysqlTerminateBackend,
    mysqlTerminateBackendConfirm,
    nodeOpenErrorMysql,
    refreshTreeMysql
  }, Symbol.toStringTag, { value: "Module" }));
  function getTreeSqlite(p_div) {
    var context_menu = {
      cm_server: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) {
                refreshTreeSqlite(node);
              } else {
                node.collapseNode();
                node.expandNode();
              }
            }
          }
        ]
      },
      cm_tables: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) {
                refreshTreeSqlite(node);
              } else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Table",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate("Create Table", node.tree.tag.create_table);
            }
          }
        ]
      },
      cm_table: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) {
                refreshTreeSqlite(node);
              } else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Data Actions",
            icon: "fas cm-all fa-list",
            submenu: {
              elements: [
                {
                  text: "Query Data",
                  icon: "fas cm-all fa-search",
                  action: function(node) {
                    TemplateSelectSqlite(node.text, "t");
                  }
                },
                {
                  text: "Edit Data",
                  icon: "fas cm-all fa-table",
                  action: function(node) {
                    v_startEditData(node.text);
                  }
                },
                {
                  text: "Insert Record",
                  icon: "fas cm-all fa-edit",
                  action: function(node) {
                    TemplateInsertSqlite(node.text);
                  }
                },
                {
                  text: "Update Records",
                  icon: "fas cm-all fa-edit",
                  action: function(node) {
                    TemplateUpdateSqlite(node.text);
                  }
                },
                {
                  text: "Delete Records",
                  icon: "fas cm-all fa-times",
                  action: function(node) {
                    tabSQLTemplate("Delete Records", node.tree.tag.delete.replace("#table_name#", node.text));
                  }
                }
              ]
            }
          },
          {
            text: "Table Actions",
            icon: "fas cm-all fa-list",
            submenu: {
              elements: [
                {
                  text: "Alter Table",
                  icon: "fas cm-all fa-edit",
                  action: function(node) {
                    tabSQLTemplate("Alter Table", node.tree.tag.alter_table.replace("#table_name#", node.text));
                  }
                },
                {
                  text: "Drop Table",
                  icon: "fas cm-all fa-times",
                  action: function(node) {
                    tabSQLTemplate("Drop Table", node.tree.tag.drop_table.replace("#table_name#", node.text));
                  }
                }
              ]
            }
          }
        ]
      },
      cm_columns: {
        elements: [
          {
            text: "Create Column",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate("Create Column", node.tree.tag.create_column.replace("#table_name#", node.parent.text));
            }
          }
        ]
      },
      cm_column: {
        elements: []
      },
      cm_pks: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) {
                refreshTreeSqlite(node);
              } else {
                node.collapseNode();
                node.expandNode();
              }
            }
          }
        ]
      },
      cm_pk: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) {
                refreshTreeSqlite(node);
              } else {
                node.collapseNode();
                node.expandNode();
              }
            }
          }
        ]
      },
      cm_fks: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) {
                refreshTreeSqlite(node);
              } else {
                node.collapseNode();
                node.expandNode();
              }
            }
          }
        ]
      },
      cm_fk: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) {
                refreshTreeSqlite(node);
              } else {
                node.collapseNode();
                node.expandNode();
              }
            }
          }
        ]
      },
      cm_uniques: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) {
                refreshTreeSqlite(node);
              } else {
                node.collapseNode();
                node.expandNode();
              }
            }
          }
        ]
      },
      cm_unique: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) {
                refreshTreeSqlite(node);
              } else {
                node.collapseNode();
                node.expandNode();
              }
            }
          }
        ]
      },
      cm_indexes: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) {
                refreshTreeSqlite(node);
              } else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Index",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate("Create Index", node.tree.tag.create_index.replace("#table_name#", node.parent.text));
            }
          }
        ]
      },
      cm_index: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) {
                refreshTreeSqlite(node);
              } else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Reindex",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate(
                "Reindex",
                node.tree.tag.reindex.replace(
                  "#index_name#",
                  node.text.replace(" (Unique)", "").replace(" (Non Unique)", "")
                )
              );
            }
          },
          {
            text: "Drop Index",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate(
                "Drop Index",
                node.tree.tag.drop_index.replace(
                  "#index_name#",
                  node.text.replace(" (Unique)", "").replace(" (Non Unique)", "")
                )
              );
            }
          }
        ]
      },
      cm_triggers: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) {
                refreshTreeSqlite(node);
              } else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create Trigger",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate("Create Trigger", node.tree.tag.create_trigger.replace("#table_name#", node.parent.text));
            }
          }
        ]
      },
      cm_trigger: {
        elements: [
          {
            text: "Alter Trigger",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate(
                "Alter Trigger",
                node.tree.tag.alter_trigger.replace("#table_name#", node.parent.parent.text).replace("#trigger_name#", node.text)
              );
            }
          },
          {
            text: "Drop Trigger",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate(
                "Drop Trigger",
                node.tree.tag.drop_trigger.replace("#table_name#", node.parent.parent.text).replace("#trigger_name#", node.text)
              );
            }
          }
        ]
      },
      cm_views: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) {
                refreshTreeSqlite(node);
              } else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Create View",
            icon: "fas cm-all fa-edit",
            action: function(node) {
              tabSQLTemplate("Create View", node.tree.tag.create_view);
            }
          }
        ]
      },
      cm_view: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) {
                refreshTreeSqlite(node);
              } else {
                node.collapseNode();
                node.expandNode();
              }
            }
          },
          {
            text: "Query Data",
            icon: "fas cm-all fa-search",
            action: function(node) {
              TemplateSelectSqlite(node.text, "v");
            }
          },
          {
            text: "Drop View",
            icon: "fas cm-all fa-times",
            action: function(node) {
              tabSQLTemplate("Drop View", node.tree.tag.drop_view.replace("#view_name#", node.text));
            }
          }
        ]
      },
      cm_refresh: {
        elements: [
          {
            text: "Refresh",
            icon: "fas cm-all fa-sync-alt",
            action: function(node) {
              if (node.childNodes == 0) {
                refreshTreeSqlite(node);
              } else {
                node.collapseNode();
                node.expandNode();
              }
            }
          }
        ]
      }
    };
    var tree = createTree(p_div, "#fcfdfd", context_menu);
    v_connTabControl.selectedTab.tag.tree = tree;
    let v_autocomplete_switch_status = v_connTabControl.selectedTab.tag.enable_autocomplete !== false ? " checked " : "";
    v_connTabControl.selectedTab.tag.divDetails.innerHTML = '<i class="fas fa-server me-1"></i>selected DB: <b>' + escapeHtml(v_connTabControl.selectedTab.tag.selectedDatabase) + '</b><div class="omnidb__switch omnidb__switch--sm float-end" data-bs-toggle="tooltip" data-bs-placement="bottom" data-bs-html="true" title="" data-bs-original-title="<h5>Toggle autocomplete.</h5><div>Switch OFF <b>disables the autocomplete</b> on the inner tabs for this connection.</div>">    <input type="checkbox" ' + v_autocomplete_switch_status + ' id="autocomplete_toggler_' + v_connTabControl.selectedTab.tag.tab_id + `" class="omnidb__switch--input" onchange="toggleConnectionAutocomplete('autocomplete_toggler_` + v_connTabControl.selectedTab.tag.tab_id + `')">    <label for="autocomplete_toggler_` + v_connTabControl.selectedTab.tag.tab_id + '" class="omnidb__switch--label"><span><i class="fas fa-spell-check"></i></span></label></div>';
    tree.nodeAfterOpenEvent = function(node) {
      refreshTreeSqlite(node);
      try {
        let v_first_child_toggle = node.elementUl.childNodes[0].childNodes[0].childNodes[0].childNodes[0];
        let pos_x = v_first_child_toggle.offsetLeft - 24;
        let pos_y = v_first_child_toggle.offsetTop - 64;
        v_connTabControl.selectedTab.tag.divTree.scroll(pos_x, pos_y);
      } catch (e) {
      }
    };
    tree.clickNodeEvent = function(node) {
      if (v_connTabControl.selectedTab.tag.treeTabsVisible) {
        getPropertiesSqlite(node);
      }
    };
    tree.beforeContextMenuEvent = function(node, callback) {
      var v_elements = [];
      if (v_connTabControl.tag.hooks.sqliteTreeContextMenu.length > 0) {
        for (var i2 = 0; i2 < v_connTabControl.tag.hooks.sqliteTreeContextMenu.length; i2++) {
          v_elements = v_elements.concat(v_connTabControl.tag.hooks.sqliteTreeContextMenu[i2](node));
        }
      }
      callback(v_elements);
    };
    var node_server = tree.createNode(
      "SQLite",
      false,
      "node-sqlite",
      null,
      {
        type: "server"
      },
      "cm_server"
    );
    node_server.createChildNode("", true, "node-spin", null, null);
    tree.drawTree();
  }
  function refreshTreeSqlite(node) {
    if (node.tag != void 0) {
      if (node.tag.type == "table_list") {
        getTablesSqlite(node);
      } else if (node.tag.type == "table") {
        getColumnsSqlite(node);
      } else if (node.tag.type == "primary_key") {
        getPKSqlite(node);
      } else if (node.tag.type == "pk") {
        getPKColumnsSqlite(node);
      } else if (node.tag.type == "uniques") {
        getUniquesSqlite(node);
      } else if (node.tag.type == "unique") {
        getUniquesColumnsSqlite(node);
      } else if (node.tag.type == "foreign_keys") {
        getFKsSqlite(node);
      } else if (node.tag.type == "foreign_key") {
        getFKsColumnsSqlite(node);
      } else if (node.tag.type == "view_list") {
        getViewsSqlite(node);
      } else if (node.tag.type == "view") {
        getViewsColumnsSqlite(node);
      } else if (node.tag.type == "indexes") {
        getIndexesSqlite(node);
      } else if (node.tag.type == "index") {
        getIndexesColumnsSqlite(node);
      } else if (node.tag.type == "trigger_list") {
        getTriggersSqlite(node);
      } else if (node.tag.type == "server") {
        getTreeDetailsSqlite(node);
      } else {
        afterNodeOpenedCallbackSqlite(node);
      }
    }
  }
  function afterNodeOpenedCallbackSqlite(node) {
    if (v_connTabControl.tag.hooks.sqliteTreeNodeOpen.length > 0) {
      for (var i2 = 0; i2 < v_connTabControl.tag.hooks.sqliteTreeNodeOpen.length; i2++) {
        v_connTabControl.tag.hooks.sqliteTreeNodeOpen[i2](node);
      }
    }
  }
  function getTreeDetailsSqlite(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_tree_info_sqlite/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id
      }),
      function(p_return) {
        node.tree.contextMenu.cm_server.elements = [];
        node.tree.contextMenu.cm_server.elements.push({
          text: "Refresh",
          icon: "fas cm-all fa-sync-alt",
          action: function(node2) {
            if (node2.childNodes == 0) {
              refreshTreeSqlite(node2);
            } else {
              node2.collapseNode();
              node2.expandNode();
            }
          }
        });
        if (node.childNodes.length > 0) {
          node.removeChildNodes();
        }
        node.tree.tag = {
          version: p_return.v_data.v_database_return.version,
          create_view: p_return.v_data.v_database_return.create_view,
          drop_view: p_return.v_data.v_database_return.drop_view,
          create_table: p_return.v_data.v_database_return.create_table,
          alter_table: p_return.v_data.v_database_return.alter_table,
          drop_table: p_return.v_data.v_database_return.drop_table,
          create_column: p_return.v_data.v_database_return.create_column,
          alter_column: p_return.v_data.v_database_return.alter_column,
          drop_column: p_return.v_data.v_database_return.drop_column,
          create_index: p_return.v_data.v_database_return.create_index,
          reindex: p_return.v_data.v_database_return.reindex,
          drop_index: p_return.v_data.v_database_return.drop_index,
          delete: p_return.v_data.v_database_return.delete,
          create_trigger: p_return.v_data.v_database_return.create_trigger,
          drop_trigger: p_return.v_data.v_database_return.drop_trigger
        };
        var node_tables = node.createChildNode(
          "Tables",
          false,
          "fas node-all fa-th node-table-list",
          {
            type: "table_list",
            num_tables: 0
          },
          "cm_tables",
          null,
          false
        );
        node_tables.createChildNode("", true, "node-spin", null, null, null, false);
        var node_views = node.createChildNode(
          "Views",
          false,
          "fas node-all fa-eye node-view-list",
          {
            type: "view_list",
            num_views: 0
          },
          "cm_views",
          null,
          false
        );
        node_views.createChildNode("", true, "node-spin", null, null, null, false);
        node.setText(p_return.v_data.v_database_return.version);
        node.drawChildNodes();
        afterNodeOpenedCallbackSqlite(node);
      },
      function(p_return) {
        nodeOpenErrorSqlite(p_return, node);
      },
      "box",
      false
    );
  }
  function nodeOpenErrorSqlite(p_return, p_node) {
    p_node.collapseNode();
    showPasswordPrompt(
      v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
      function() {
        p_node.expandNode();
      },
      null,
      p_return.v_data.message
    );
  }
  function getTablesSqlite(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_tables_sqlite/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id
      }),
      function(p_return) {
        if (node.childNodes.length > 0) {
          node.removeChildNodes();
        }
        node.setText("Tables (" + p_return.v_data.length + ")");
        node.tag.num_tables = p_return.v_data.length;
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i].v_name,
            false,
            "fas node-all fa-table node-table",
            {
              type: "table",
              has_primary_keys: p_return.v_data[i].v_has_primary_keys,
              has_foreign_keys: p_return.v_data[i].v_has_foreign_keys,
              has_uniques: p_return.v_data[i].v_has_uniques,
              has_indexes: p_return.v_data[i].v_has_indexes,
              has_checks: p_return.v_data[i].v_has_checks,
              has_excludes: p_return.v_data[i].v_has_excludes,
              has_rules: p_return.v_data[i].v_has_rules,
              has_triggers: p_return.v_data[i].v_has_triggers,
              has_partitions: p_return.v_data[i].v_has_partitions,
              has_statistics: p_return.v_data[i].v_has_statistics,
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_table",
            null,
            false
          );
          v_node.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "table_field"
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackSqlite(node);
      },
      function(p_return) {
        nodeOpenErrorSqlite(p_return, node);
      },
      "box",
      false
    );
  }
  function getColumnsSqlite(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_columns_sqlite/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) {
          node.removeChildNodes();
        }
        v_list = node.createChildNode(
          "Columns (" + p_return.v_data.length + ")",
          false,
          "fas node-all fa-columns node-column",
          {
            type: "column_list",
            database: v_connTabControl.selectedTab.tag.selectedDatabase
          },
          "cm_columns",
          null,
          false
        );
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = v_list.createChildNode(
            p_return.v_data[i].v_column_name,
            false,
            "fas node-all fa-columns node-column",
            {
              type: "table_field",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_column",
            null,
            false
          );
          v_node.createChildNode(
            "Type: " + p_return.v_data[i].v_data_type,
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            {
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
          v_node.createChildNode(
            "Nullable: " + p_return.v_data[i].v_nullable,
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            {
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
        }
        if (node.tag.has_primary_keys) {
          v_node = node.createChildNode(
            "Primary Key",
            false,
            "fas node-all fa-key node-pkey",
            {
              type: "primary_key",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_pks",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_foreign_keys) {
          v_node = node.createChildNode(
            "Foreign Keys",
            false,
            "fas node-all fa-key node-fkey",
            {
              type: "foreign_keys",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_fks",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_uniques) {
          v_node = node.createChildNode(
            "Uniques",
            false,
            "fas node-all fa-key node-unique",
            {
              type: "uniques",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_uniques",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_checks) {
          v_node = node.createChildNode(
            "Checks",
            false,
            "fas node-all fa-check-square node-check",
            {
              type: "check_list",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_checks",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_indexes) {
          v_node = node.createChildNode(
            "Indexes",
            false,
            "fas node-all fa-thumbtack node-index",
            {
              type: "indexes",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_indexes",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_triggers) {
          v_node = node.createChildNode(
            "Triggers",
            false,
            "fas node-all fa-bolt node-trigger",
            {
              type: "trigger_list",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_triggers",
            null,
            false
          );
          v_node.createChildNode("", false, "node-spin", null, null, null, false);
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackSqlite(node);
      },
      function(p_return) {
        nodeOpenErrorSqlite(p_return, node);
      },
      "box",
      false
    );
  }
  function getPKSqlite(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_pk_sqlite/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.text
      }),
      function(p_return) {
        node.setText("Primary Key (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) {
          node.removeChildNodes();
        }
        if (p_return.v_data.length > 0) {
          v_node = node.createChildNode(
            p_return.v_data[0][0],
            false,
            "fas node-all fa-key node-pkey",
            {
              type: "pk",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_pk"
          );
          v_node.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "pk_field"
            },
            null
          );
        }
        afterNodeOpenedCallbackSqlite(node);
      },
      function(p_return) {
        nodeOpenErrorSqlite(p_return, node);
      },
      "box",
      false
    );
  }
  function getPKColumnsSqlite(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_pk_columns_sqlite/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) {
          node.removeChildNodes();
        }
        for (var i2 = 0; i2 < p_return.v_data.length; i2++) {
          v_node.createChildNode(
            p_return.v_data[i2][0],
            false,
            "fas node-all fa-columns node-column",
            {
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackSqlite(node);
      },
      function(p_return) {
        nodeOpenErrorSqlite(p_return, node);
      },
      "box",
      false
    );
  }
  function getFKsSqlite(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_fks_sqlite/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.text
      }),
      function(p_return) {
        node.setText("Foreign Keys (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) {
          node.removeChildNodes();
        }
        for (i = 0; i < p_return.v_data.length; i++) {
          v_node = node.createChildNode(
            p_return.v_data[i][0],
            false,
            "fas node-all fa-key node-fkey",
            {
              type: "foreign_key",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_fk",
            null,
            false
          );
          v_node.createChildNode(
            "Referenced Table: " + p_return.v_data[i][1],
            false,
            "fas node-all fa-table node-table",
            {
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
          v_node.createChildNode(
            "Delete Rule: " + p_return.v_data[i][2],
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            {
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
          v_node.createChildNode(
            "Update Rule: " + p_return.v_data[i][3],
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            {
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
          v_curr_fk = p_return.v_data[i][0];
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackSqlite(node);
      },
      function(p_return) {
        nodeOpenErrorSqlite(p_return, node);
      },
      "box",
      false
    );
  }
  function getFKsColumnsSqlite(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_fks_columns_sqlite/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_fkey: node.text,
        p_table: node.parent.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) {
          node.removeChildNodes();
        }
        node.createChildNode(
          "Referenced Table: " + p_return.v_data[0][0],
          false,
          "fas node-all fa-table node-table",
          {
            database: v_connTabControl.selectedTab.tag.selectedDatabase
          },
          null,
          null,
          false
        );
        node.createChildNode(
          "Delete Rule: " + p_return.v_data[0][1],
          false,
          "fas node-all fa-ellipsis-h node-bullet",
          {
            database: v_connTabControl.selectedTab.tag.selectedDatabase
          },
          null,
          null,
          false
        );
        node.createChildNode(
          "Update Rule: " + p_return.v_data[0][2],
          false,
          "fas node-all fa-ellipsis-h node-bullet",
          {
            database: v_connTabControl.selectedTab.tag.selectedDatabase
          },
          null,
          null,
          false
        );
        for (var i2 = 0; i2 < p_return.v_data.length; i2++) {
          node.createChildNode(
            p_return.v_data[i2][3] + " <i class='fas node-all fa-arrow-right'></i> " + p_return.v_data[i2][4],
            false,
            "fas node-all fa-columns node-column",
            {
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackSqlite(node);
      },
      function(p_return) {
        nodeOpenErrorSqlite(p_return, node);
      },
      "box",
      false
    );
  }
  function getUniquesSqlite(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_uniques_sqlite/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.text
      }),
      function(p_return) {
        node.setText("Uniques (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) {
          node.removeChildNodes();
        }
        for (var i2 = 0; i2 < p_return.v_data.length; i2++) {
          v_node = node.createChildNode(
            p_return.v_data[i2][0],
            false,
            "fas node-all fa-key node-unique",
            {
              type: "unique",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_unique",
            null,
            false
          );
          v_node.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "unique_field"
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackSqlite(node);
      },
      function(p_return) {
        nodeOpenErrorSqlite(p_return, node);
      },
      "box",
      false
    );
  }
  function getUniquesColumnsSqlite(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_uniques_columns_sqlite/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_unique: node.text,
        p_table: node.parent.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) {
          node.removeChildNodes();
        }
        for (var i2 = 0; i2 < p_return.v_data.length; i2++) {
          node.createChildNode(
            p_return.v_data[i2][0],
            false,
            "fas node-all fa-columns node-column",
            {
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackSqlite(node);
      },
      function(p_return) {
        nodeOpenErrorSqlite(p_return, node);
      },
      "box",
      false
    );
  }
  function getIndexesSqlite(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_indexes_sqlite/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.text
      }),
      function(p_return) {
        node.setText("Indexes (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) {
          node.removeChildNodes();
        }
        for (var i2 = 0; i2 < p_return.v_data.length; i2++) {
          var v_node2 = node.createChildNode(
            p_return.v_data[i2][0] + " (" + p_return.v_data[i2][1] + ")",
            false,
            "fas node-all fa-thumbtack node-index",
            {
              type: "index",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_index",
            null,
            false
          );
          v_node2.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "index_field",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackSqlite(node);
      },
      function(p_return) {
        nodeOpenErrorSqlite(p_return, node);
      },
      "box",
      false
    );
  }
  function getIndexesColumnsSqlite(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_indexes_columns_sqlite/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_index: node.text.replace(" (Non Unique)", "").replace(" (Unique)", ""),
        p_table: node.parent.parent.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) {
          node.removeChildNodes();
        }
        for (var i2 = 0; i2 < p_return.v_data.length; i2++) {
          node.createChildNode(
            p_return.v_data[i2][0],
            false,
            "fas node-all fa-columns node-column",
            {
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackSqlite(node);
      },
      function(p_return) {
        nodeOpenErrorSqlite(p_return, node);
      },
      "box",
      false
    );
  }
  function getViewsSqlite(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_views_sqlite/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id
      }),
      function(p_return) {
        if (node.childNodes.length > 0) {
          node.removeChildNodes();
        }
        node.setText("Views (" + p_return.v_data.length + ")");
        node.tag.num_tables = p_return.v_data.length;
        for (var i2 = 0; i2 < p_return.v_data.length; i2++) {
          var v_node2 = node.createChildNode(
            p_return.v_data[i2].v_name,
            false,
            "fas node-all fa-eye node-view",
            {
              type: "view",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_view",
            null,
            false
          );
          v_node2.createChildNode(
            "",
            false,
            "node-spin",
            {
              type: "view_field"
            },
            null,
            null,
            false
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackSqlite(node);
      },
      function(p_return) {
        nodeOpenErrorSqlite(p_return, node);
      },
      "box",
      false
    );
  }
  function getViewsColumnsSqlite(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_views_columns_sqlite/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.text
      }),
      function(p_return) {
        if (node.childNodes.length > 0) {
          node.removeChildNodes();
        }
        var v_list2 = node.createChildNode(
          "Columns (" + p_return.v_data.length + ")",
          false,
          "fas node-all fa-columns node-column",
          {
            database: v_connTabControl.selectedTab.tag.selectedDatabase
          },
          null,
          null,
          false
        );
        for (var i2 = 0; i2 < p_return.v_data.length; i2++) {
          var v_node2 = v_list2.createChildNode(
            p_return.v_data[i2].v_column_name,
            false,
            "fas node-all fa-columns node-column",
            {
              type: "table_field",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
          v_node2.createChildNode(
            "Type: " + p_return.v_data[i2].v_data_type,
            false,
            "fas node-all fa-ellipsis-h node-bullet",
            {
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            null,
            null,
            false
          );
        }
        if (node.tag.has_rules) {
          var v_node2 = node.createChildNode(
            "Rules",
            false,
            "fas node-all fa-lightbulb node-rule",
            {
              type: "rule_list",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_rules",
            null,
            false
          );
          v_node2.createChildNode("", false, "node-spin", null, null, null, false);
        }
        if (node.tag.has_triggers) {
          var v_node2 = node.createChildNode(
            "Triggers",
            false,
            "fas node-all fa-bolt node-trigger",
            {
              type: "trigger_list",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_view_triggers",
            null,
            false
          );
          v_node2.createChildNode("", false, "node-spin", null, null, null, false);
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackSqlite(node);
      },
      function(p_return) {
        nodeOpenErrorSqlite(p_return, node);
      },
      "box",
      false
    );
  }
  function getViewDefinitionSqlite(node) {
    execAjax(
      "/get_view_definition_sqlite/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_view: node.text
      }),
      function(p_return) {
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data);
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
        renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);
        var v_div_result = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;
        if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht != null) {
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht.destroy();
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht = null;
        }
        v_div_result.innerHTML = "";
      },
      function(p_return) {
        nodeOpenErrorSqlite(p_return, node);
      },
      "box",
      true
    );
  }
  function getTriggersSqlite(node) {
    node.removeChildNodes();
    node.createChildNode("", false, "node-spin", null, null);
    execAjax(
      "/get_triggers_sqlite/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table: node.parent.text
      }),
      function(p_return) {
        node.setText("Triggers (" + p_return.v_data.length + ")");
        if (node.childNodes.length > 0) {
          node.removeChildNodes();
        }
        for (var i2 = 0; i2 < p_return.v_data.length; i2++) {
          node.createChildNode(
            p_return.v_data[i2].v_name,
            false,
            "fas node-all fa-bolt node-trigger",
            {
              type: "trigger",
              database: v_connTabControl.selectedTab.tag.selectedDatabase
            },
            "cm_trigger",
            null,
            true
          );
        }
        node.drawChildNodes();
        afterNodeOpenedCallbackSqlite(node);
      },
      function(p_return) {
        nodeOpenErrorSqlite(p_return, node);
      },
      "box",
      false
    );
  }
  function TemplateSelectSqlite(p_table, p_kind) {
    execAjax(
      "/template_select_sqlite/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table,
        p_kind
      }),
      function(p_return) {
        let v_tab_name = p_table;
        v_connTabControl.tag.createQueryTab(v_tab_name);
        var v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;
        v_tab_tag.editor.setValue(p_return.v_data.v_template);
        v_tab_tag.editor.clearSelection();
        querySQL(0);
      },
      function(p_return) {
        showError(p_return.v_data);
        return "";
      },
      "box",
      true
    );
  }
  function TemplateInsertSqlite(p_table) {
    execAjax(
      "/template_insert_sqlite/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table
      }),
      function(p_return) {
        tabSQLTemplate("Insert " + p_table, p_return.v_data.v_template);
      },
      function(p_return) {
        showError(p_return.v_data);
        return "";
      },
      "box",
      true
    );
  }
  function TemplateUpdateSqlite(p_table) {
    execAjax(
      "/template_update_sqlite/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_table
      }),
      function(p_return) {
        tabSQLTemplate("Update " + p_table, p_return.v_data.v_template);
      },
      function(p_return) {
        showError(p_return.v_data);
        return "";
      },
      "box",
      true
    );
  }
  function getPropertiesSqlite(node) {
    if (node.tag != void 0) {
      if (node.tag.type == "table") {
        getProperties("/get_properties_sqlite/", {
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "table_field") {
        getProperties("/get_properties_sqlite/", {
          p_table: node.parent.parent.text,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "view") {
        getProperties("/get_properties_sqlite/", {
          p_table: null,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "trigger") {
        getProperties("/get_properties_sqlite/", {
          p_table: node.parent.parent.text,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "index") {
        getProperties("/get_properties_sqlite/", {
          p_table: node.parent.parent.text,
          p_object: node.text.replace(" (Non Unique)", "").replace(" (Unique)", ""),
          p_type: node.tag.type
        });
      } else if (node.tag.type == "pk") {
        getProperties("/get_properties_sqlite/", {
          p_table: node.parent.parent.text,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "foreign_key") {
        getProperties("/get_properties_sqlite/", {
          p_table: node.parent.parent.text,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else if (node.tag.type == "unique") {
        getProperties("/get_properties_sqlite/", {
          p_table: node.parent.parent.text,
          p_object: node.text,
          p_type: node.tag.type
        });
      } else {
        clearProperties();
      }
    }
    if (v_connTabControl.tag.hooks.sqliteTreeNodeClick.length > 0) {
      for (var i2 = 0; i2 < v_connTabControl.tag.hooks.sqliteTreeNodeClick.length; i2++)
        v_connTabControl.tag.hooks.sqliteTreeNodeClick[i2](node);
    }
  }
  const treeSqlite = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    TemplateInsertSqlite,
    TemplateSelectSqlite,
    TemplateUpdateSqlite,
    afterNodeOpenedCallbackSqlite,
    getColumnsSqlite,
    getFKsColumnsSqlite,
    getFKsSqlite,
    getIndexesColumnsSqlite,
    getIndexesSqlite,
    getPKColumnsSqlite,
    getPKSqlite,
    getPropertiesSqlite,
    getTablesSqlite,
    getTreeDetailsSqlite,
    getTreeSqlite,
    getTriggersSqlite,
    getUniquesColumnsSqlite,
    getUniquesSqlite,
    getViewDefinitionSqlite,
    getViewsColumnsSqlite,
    getViewsSqlite,
    nodeOpenErrorSqlite,
    refreshTreeSqlite
  }, Symbol.toStringTag, { value: "Module" }));
  function blueHtmlRenderer$1(instance, td, row, col, prop, value, cellProperties) {
    if (cellProperties.__proto__.type == "dropdown" || cellProperties.__proto__.type == "autocomplete") {
      Handsontable.renderers.AutocompleteRenderer.apply(this, arguments);
    } else if (cellProperties.__proto__.type == "password") {
      Handsontable.renderers.PasswordRenderer.apply(this, arguments);
    } else if (cellProperties.__proto__.type == "checkbox") {
      Handsontable.renderers.CheckboxRenderer.apply(this, arguments);
    } else {
      Handsontable.renderers.HtmlRenderer.apply(this, arguments);
    }
    td.className = "cellEven";
  }
  function greenHtmlRenderer(instance, td, row, col, prop, value, cellProperties) {
    if (cellProperties.__proto__.type == "dropdown" || cellProperties.__proto__.type == "autocomplete") {
      Handsontable.renderers.AutocompleteRenderer.apply(this, arguments);
    } else if (cellProperties.__proto__.type == "password") {
      Handsontable.renderers.PasswordRenderer.apply(this, arguments);
    } else if (cellProperties.__proto__.type == "checkbox") {
      Handsontable.renderers.CheckboxRenderer.apply(this, arguments);
    } else {
      Handsontable.renderers.HtmlRenderer.apply(this, arguments);
    }
    td.className = "cellNew";
  }
  function yellowHtmlRenderer(instance, td, row, col, prop, value, cellProperties) {
    if (cellProperties.__proto__.type == "dropdown" || cellProperties.__proto__.type == "autocomplete") {
      Handsontable.renderers.AutocompleteRenderer.apply(this, arguments);
    } else if (cellProperties.__proto__.type == "password") {
      Handsontable.renderers.PasswordRenderer.apply(this, arguments);
    } else if (cellProperties.__proto__.type == "checkbox") {
      Handsontable.renderers.CheckboxRenderer.apply(this, arguments);
    } else {
      Handsontable.renderers.HtmlRenderer.apply(this, arguments);
    }
    td.className = "cellEdit";
  }
  function whiteHtmlRenderer$1(instance, td, row, col, prop, value, cellProperties) {
    if (cellProperties.__proto__.type == "dropdown" || cellProperties.__proto__.type == "autocomplete") {
      Handsontable.renderers.AutocompleteRenderer.apply(this, arguments);
    } else if (cellProperties.__proto__.type == "password") {
      Handsontable.renderers.PasswordRenderer.apply(this, arguments);
    } else if (cellProperties.__proto__.type == "checkbox") {
      Handsontable.renderers.CheckboxRenderer.apply(this, arguments);
    } else {
      Handsontable.renderers.HtmlRenderer.apply(this, arguments);
    }
    td.className = "cellOdd";
  }
  function whiteRightHtmlRenderer(instance, td, row, col, prop, value, cellProperties) {
    if (cellProperties.__proto__.type == "dropdown" || cellProperties.__proto__.type == "autocomplete") {
      Handsontable.renderers.AutocompleteRenderer.apply(this, arguments);
    } else if (cellProperties.__proto__.type == "password") {
      Handsontable.renderers.PasswordRenderer.apply(this, arguments);
    } else if (cellProperties.__proto__.type == "checkbox") {
      Handsontable.renderers.CheckboxRenderer.apply(this, arguments);
    } else {
      Handsontable.renderers.HtmlRenderer.apply(this, arguments);
    }
    td.style.textAlign = "right";
  }
  function redHtmlRenderer(instance, td, row, col, prop, value, cellProperties) {
    if (cellProperties.__proto__.type == "dropdown" || cellProperties.__proto__.type == "autocomplete") {
      Handsontable.renderers.AutocompleteRenderer.apply(this, arguments);
    } else if (cellProperties.__proto__.type == "password") {
      Handsontable.renderers.PasswordRenderer.apply(this, arguments);
    } else if (cellProperties.__proto__.type == "checkbox") {
      Handsontable.renderers.CheckboxRenderer.apply(this, arguments);
    } else {
      Handsontable.renderers.HtmlRenderer.apply(this, arguments);
    }
    td.className = "cellRemove";
  }
  function grayHtmlRenderer(instance, td, row, col, prop, value, cellProperties) {
    if (cellProperties.__proto__.type == "dropdown" || cellProperties.__proto__.type == "autocomplete") {
      Handsontable.renderers.AutocompleteRenderer.apply(this, arguments);
    } else if (cellProperties.__proto__.type == "password") {
      Handsontable.renderers.PasswordRenderer.apply(this, arguments);
    } else if (cellProperties.__proto__.type == "checkbox") {
      Handsontable.renderers.CheckboxRenderer.apply(this, arguments);
    } else {
      Handsontable.renderers.HtmlRenderer.apply(this, arguments);
    }
    td.className = "cellReadOnly";
  }
  function yellowRenderer(instance, td, row, col, prop, value, cellProperties) {
    if (cellProperties.__proto__.type == "dropdown" || cellProperties.__proto__.type == "autocomplete") {
      Handsontable.renderers.AutocompleteRenderer.apply(this, arguments);
    } else {
      Handsontable.renderers.TextRenderer.apply(this, arguments);
    }
    td.className = "cellEdit";
  }
  function blueRenderer(instance, td, row, col, prop, value, cellProperties) {
    if (cellProperties.__proto__.type == "dropdown" || cellProperties.__proto__.type == "autocomplete") {
      Handsontable.renderers.AutocompleteRenderer.apply(this, arguments);
    } else {
      Handsontable.renderers.TextRenderer.apply(this, arguments);
    }
    td.className = "cellEven";
  }
  function whiteRenderer$1(instance, td, row, col, prop, value, cellProperties) {
    if (cellProperties.__proto__.type == "dropdown" || cellProperties.__proto__.type == "autocomplete") {
      Handsontable.renderers.AutocompleteRenderer.apply(this, arguments);
    } else {
      Handsontable.renderers.TextRenderer.apply(this, arguments);
    }
    td.className = "cellOdd";
  }
  function redRenderer(instance, td, row, col, prop, value, cellProperties) {
    if (cellProperties.__proto__.type == "dropdown" || cellProperties.__proto__.type == "autocomplete") {
      Handsontable.renderers.AutocompleteRenderer.apply(this, arguments);
    } else {
      Handsontable.renderers.TextRenderer.apply(this, arguments);
    }
    td.className = "cellRemove";
  }
  function grayRenderer(instance, td, row, col, prop, value, cellProperties) {
    if (cellProperties.__proto__.type == "dropdown" || cellProperties.__proto__.type == "autocomplete") {
      Handsontable.renderers.AutocompleteRenderer.apply(this, arguments);
    } else {
      Handsontable.renderers.TextRenderer.apply(this, arguments);
    }
    td.className = "cellReadOnly";
  }
  function greenRenderer(instance, td, row, col, prop, value, cellProperties) {
    if (cellProperties.__proto__.type == "dropdown" || cellProperties.__proto__.type == "autocomplete") {
      Handsontable.renderers.AutocompleteRenderer.apply(this, arguments);
    } else {
      Handsontable.renderers.TextRenderer.apply(this, arguments);
    }
    td.className = "cellNew";
  }
  function grayEmptyRenderer(instance, td, row, col, prop, value, cellProperties) {
    arguments[5] = "";
    Handsontable.renderers.HtmlRenderer.apply(this, arguments);
    td.className = "cellReadOnly";
  }
  function newRowRenderer(instance, td, row, col, prop, value, cellProperties) {
    arguments[5] = "+";
    td.style.textAlign = "center";
    Handsontable.renderers.HtmlRenderer.apply(this, arguments);
    td.className = "cellReadOnly";
  }
  function columnsActionRenderer(instance, td, row, col, prop, value, cellProperties) {
    arguments[5] = "<i title='Remove' class='fas fa-times action-grid action-close text-danger' onclick='dropColumnAlterTable()'></i>";
    Handsontable.renderers.HtmlRenderer.apply(this, arguments);
    td.className = "cellReadOnly";
  }
  function editDataActionRenderer(instance, td, row, col, prop, value, cellProperties) {
    arguments[5] = "<div class='text-center'><i title='Remove' class='fas fa-times action-grid action-close text-danger' onclick='deleteRowEditData()'></i></div>";
    Handsontable.renderers.HtmlRenderer.apply(this, arguments);
    td.className = "cellReadOnly";
  }
  function monitorStatusRenderer(instance, td, row, col, prop, value, cellProperties) {
    if (cellProperties.__proto__.type == "dropdown" || cellProperties.__proto__.type == "autocomplete") {
      Handsontable.renderers.AutocompleteRenderer.apply(this, arguments);
    } else {
      Handsontable.renderers.HtmlRenderer.apply(this, arguments);
    }
    if (value == "unknown") td.setAttribute("style", "background-color: rgb(165, 84, 175) !important");
    else if (value == "ok" || value == "recovery") td.setAttribute("style", "background-color: rgb(74, 183, 65) !important");
    else if (value == "warning") td.setAttribute("style", "background-color: rgb(255, 161, 45) !important");
    else if (value == "critical") td.setAttribute("style", "background-color: rgb(232, 79, 79) !important");
    td.style.color = "white";
    td.style["text-align"] = "center";
  }
  const renderers = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    blueHtmlRenderer: blueHtmlRenderer$1,
    blueRenderer,
    columnsActionRenderer,
    editDataActionRenderer,
    grayEmptyRenderer,
    grayHtmlRenderer,
    grayRenderer,
    greenHtmlRenderer,
    greenRenderer,
    monitorStatusRenderer,
    newRowRenderer,
    redHtmlRenderer,
    redRenderer,
    whiteHtmlRenderer: whiteHtmlRenderer$1,
    whiteRenderer: whiteRenderer$1,
    whiteRightHtmlRenderer,
    yellowHtmlRenderer,
    yellowRenderer
  }, Symbol.toStringTag, { value: "Module" }));
  function showAbout() {
    $("#modal_about").modal("show");
  }
  var v_light_terminal_theme = {
    background: "#f4f4f4",
    brightBlue: "#006de2",
    brightGreen: "#4b9800",
    foreground: "#454545",
    cursor: "#454545",
    cursorAccent: "#454545",
    selection: "#00000030"
  };
  var v_dark_terminal_theme = {
    background: "#1a1a1d"
  };
  var v_current_terminal_theme$1;
  $(function() {
    document.getElementsByTagName("html")[0].style["font-size"] = v_font_size + "px";
    changeTheme();
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event2) => {
      changeTheme();
    });
  });
  function adjustChartTheme(p_chart) {
    var v_chart_font_color = "#666666";
    var v_chart_grid_color = "rgba(0, 0, 0, 0.1)";
    if (v_theme == "light") {
      v_chart_font_color = "#666666";
      v_chart_grid_color = "rgba(0, 0, 0, 0.1)";
    } else {
      v_chart_font_color = "#DCDDDE";
      v_chart_grid_color = "rgba(100, 100, 100, 0.3)";
    }
    try {
      p_chart.legend.options.labels.fontColor = v_chart_font_color;
      p_chart.options.title.fontColor = v_chart_font_color;
      p_chart.scales["y-axis-0"].options.gridLines.color = v_chart_grid_color;
      p_chart.scales["x-axis-0"].options.gridLines.color = v_chart_grid_color;
      p_chart.scales["y-axis-0"].options.ticks.minor.fontColor = v_chart_font_color;
      p_chart.scales["y-axis-0"].options.scaleLabel.fontColor = v_chart_font_color;
      p_chart.scales["x-axis-0"].options.ticks.minor.fontColor = v_chart_font_color;
      p_chart.scales["x-axis-0"].options.scaleLabel.fontColor = v_chart_font_color;
    } catch (err) {
    }
    p_chart.update();
  }
  function adjustGraphTheme(p_graph) {
    var v_font_color = "#666666";
    if (v_theme == "light") {
      v_font_color = "#666666";
    } else {
      v_font_color = "#DCDDDE";
    }
    try {
      p_graph.style().selector("node").style("color", v_font_color);
      p_graph.style().selector("edge").style("color", v_font_color);
      p_graph.nodes().updateStyle();
      p_graph.edges().updateStyle();
    } catch (err) {
    }
  }
  function changeTheme(p_option) {
    v_theme = "auto";
    var v_actual_theme = "light";
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      v_actual_theme = "dark";
    }
    if (v_actual_theme == "dark") {
      v_theme = "dark";
      v_editor_theme = "sqlserver_dark";
      v_current_terminal_theme$1 = v_dark_terminal_theme;
      document.body.classList.remove("omnidb--theme-light");
      document.body.classList.add("omnidb--theme-dark");
    } else {
      v_theme = "light";
      v_editor_theme = "sqlserver";
      v_current_terminal_theme$1 = v_light_terminal_theme;
      document.body.classList.remove("omnidb--theme-dark");
      document.body.classList.add("omnidb--theme-light");
    }
    try {
      for (let i3 = 0; i3 < v_connTabControl.tabList.length; i3++) {
        var v_outer_tab = v_connTabControl.tabList[i3];
        if (v_outer_tab.tag) {
          if (v_outer_tab.tag.tabControl) {
            if (v_outer_tab.tag.tabControl.tabList) {
              for (let j3 = 0; j3 < v_outer_tab.tag.tabControl.tabList.length; j3++) {
                var v_inner_tab_tag = v_outer_tab.tag.tabControl.tabList[j3].tag;
                if (v_inner_tab_tag.editor) {
                  v_inner_tab_tag.editor.setTheme("ace/theme/" + v_editor_theme);
                } else if (v_inner_tab_tag.editor_console) {
                  v_inner_tab_tag.editor_console.setOption("theme", v_current_terminal_theme$1);
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn(e);
    }
    var els = document.getElementsByClassName("ace_editor");
    Array.prototype.forEach.call(els, function(el) {
      ace.edit(el).setTheme("ace/theme/" + v_editor_theme);
    });
    if (typeof Chart !== "undefined") {
      Chart.helpers.each(Chart.instances, function(instance) {
        adjustChartTheme(instance.chart);
      });
    }
    if (typeof v_connTabControl !== "undefined") {
      for (var i2 = 0; i2 < v_connTabControl.tabList.length; i2++) {
        var v_tab = v_connTabControl.tabList[i2];
        if (v_tab.tag != null) {
          if (v_tab.tag.mode == "outer_terminal") {
            v_tab.tag.editor_console.setOption("theme", v_current_terminal_theme$1);
          }
        }
      }
      for (var i2 = 0; i2 < v_connTabControl.tabList.length; i2++) {
        var v_tab = v_connTabControl.tabList[i2];
        if (v_tab.tag != null) {
          if (v_tab.tag.mode == "connection") {
            for (var j2 = 0; j2 < v_tab.tag.tabControl.tabList.length; j2++) {
              var v_inner_tab = v_tab.tag.tabControl.tabList[j2];
              if (v_inner_tab.tag != null) {
                if (v_inner_tab.tag.mode == "monitor_dashboard") {
                  for (var k = 0; k < v_inner_tab.tag.units.length; k++) {
                    if (v_inner_tab.tag.units[k].type == "graph") adjustGraphTheme(v_inner_tab.tag.units[k].object);
                  }
                }
              }
            }
          }
        }
      }
      if (v_connTabControl.tag.hooks.changeTheme.length > 0) {
        for (var i2 = 0; i2 < v_connTabControl.tag.hooks.changeTheme.length; i2++)
          v_connTabControl.tag.hooks.changeTheme[i2](null, v_theme);
      }
    }
  }
  function changeFontSize(p_option) {
    var els = document.getElementsByClassName("ace_editor");
    v_font_size = p_option;
    for (var i2 = 0; i2 < v_connTabControl.tabList.length; i2++) {
      var v_tab = v_connTabControl.tabList[i2];
      if (v_tab.tag != null) {
        if (v_tab.tag.mode == "outer_terminal") {
          v_tab.tag.editor_console.setOption("fontSize", p_option);
          v_tab.tag.editor_console.fit();
        }
      }
    }
    Array.prototype.forEach.call(els, function(el) {
      ace.edit(el).setFontSize(Number(p_option));
    });
  }
  function changeInterfaceFontSize(p_option) {
    v_font_size = p_option;
    document.getElementsByTagName("html")[0].style["font-size"] = v_font_size + "px";
    $(".ace_editor").each(function(index) {
      let editor = ace.edit(this);
      editor.setFontSize(v_font_size + "px");
    });
    var v_outer_tab_list = v_connTabControl.tabList;
    for (let i2 = 0; i2 < v_outer_tab_list.length; i2++) {
      var v_outer_tab_tag = v_outer_tab_list[i2].tag;
      if (v_outer_tab_tag) {
        var v_outer_tab_tag_inner_tab_control = v_outer_tab_tag.tabControl;
        if (v_outer_tab_tag_inner_tab_control) {
          var v_outer_tab_tag_inner_tab_list = v_outer_tab_tag_inner_tab_control.tabList;
          for (let j2 = 0; j2 < v_outer_tab_tag_inner_tab_list.length; j2++) {
            var v_inner_tab_tag = v_outer_tab_tag_inner_tab_list[j2].tag;
            if (v_inner_tab_tag) {
              if (v_inner_tab_tag.editor_console) {
                v_inner_tab_tag.editor_console.setOption("fontSize", Number(v_font_size));
              }
            }
          }
        }
      }
    }
    refreshHeights();
  }
  function updateIndentUnit() {
    var charEl = document.querySelector('input[name="indent_char"]:checked');
    var sizeEl = document.querySelector('input[name="indent_size"]:checked');
    if (charEl) v_indent_char = charEl.value;
    if (sizeEl) v_indent_size = parseInt(sizeEl.value);
    if (v_indent_char === "tab") {
      v_indent_unit = "	";
    } else {
      v_indent_unit = "";
      for (var i2 = 0; i2 < v_indent_size; i2++) v_indent_unit += " ";
    }
  }
  function applyEditorTabSize() {
    $(".ace_editor").each(function() {
      let editor = ace.edit(this);
      editor.session.setTabSize(v_indent_size || 4);
      editor.session.setUseSoftTabs(v_indent_char !== "tab");
    });
  }
  function showConfigUser() {
    if ($("#modal_config").hasClass("show")) {
      return;
    }
    document.getElementById("sel_interface_font_size").value = v_font_size;
    document.getElementById("txt_confirm_new_pwd").value = "";
    document.getElementById("txt_new_pwd").value = "";
    document.getElementById("sel_csv_encoding").value = v_csv_encoding;
    document.getElementById("txt_csv_delimiter").value = v_csv_delimiter;
    var charRadios = document.getElementsByName("indent_char");
    for (var i2 = 0; i2 < charRadios.length; i2++) {
      if (charRadios[i2].value === v_indent_char) {
        charRadios[i2].checked = true;
        break;
      }
    }
    var sizeRadios = document.getElementsByName("indent_size");
    for (var i2 = 0; i2 < sizeRadios.length; i2++) {
      if (sizeRadios[i2].value === String(v_indent_size)) {
        sizeRadios[i2].checked = true;
        break;
      }
    }
    var commaRadios = document.getElementsByName("comma_style");
    for (var i2 = 0; i2 < commaRadios.length; i2++) {
      if (commaRadios[i2].value === v_comma_style) {
        commaRadios[i2].checked = true;
        break;
      }
    }
    var caseRadios = document.getElementsByName("keyword_case");
    for (var i2 = 0; i2 < caseRadios.length; i2++) {
      if (caseRadios[i2].value === v_keyword_case) {
        caseRadios[i2].checked = true;
        break;
      }
    }
    var v_disabled_autocomplete_types = v_autocomplete_disabled_types.split(",");
    var typeCheckboxes = document.getElementsByName("autocomplete_type");
    for (var i2 = 0; i2 < typeCheckboxes.length; i2++) {
      typeCheckboxes[i2].checked = v_disabled_autocomplete_types.indexOf(typeCheckboxes[i2].value) === -1;
    }
    var configModal = new bootstrap.Modal(document.getElementById("modal_config"), { backdrop: "static", keyboard: true });
    configModal.show();
  }
  function goToConnections() {
    showConfirm("You will lose existing changes. Would you like to continue?", function() {
      window.open("../connections", "_self");
    });
  }
  function confirmSignout() {
    showConfirm("Are you sure you want to sign out?", function() {
      window.open("../logout", "_self");
    });
  }
  function showWebsite(p_name, p_url) {
    if (v_connTabControl) $("#modal_about").modal("hide");
    v_connTabControl.tag.createWebsiteOuterTab(p_name, p_url);
  }
  function setAllAutocompleteTypeCheckboxes(p_checked) {
    var typeCheckboxes = document.getElementsByName("autocomplete_type");
    for (var i2 = 0; i2 < typeCheckboxes.length; i2++) {
      typeCheckboxes[i2].checked = p_checked;
    }
  }
  function saveConfigUser() {
    v_font_size = document.getElementById("sel_interface_font_size").value;
    var v_confirm_pwd = document.getElementById("txt_confirm_new_pwd");
    var v_pwd = document.getElementById("txt_new_pwd");
    v_csv_encoding = document.getElementById("sel_csv_encoding").value;
    v_csv_delimiter = document.getElementById("txt_csv_delimiter").value;
    var v_disabled_types = [];
    var typeCheckboxes = document.getElementsByName("autocomplete_type");
    for (var i2 = 0; i2 < typeCheckboxes.length; i2++) {
      if (!typeCheckboxes[i2].checked) v_disabled_types.push(typeCheckboxes[i2].value);
    }
    v_autocomplete_disabled_types = v_disabled_types.join(",");
    if ((v_confirm_pwd.value != "" || v_pwd.value != "") && v_pwd.value != v_confirm_pwd.value)
      showAlert("New Password and Confirm New Password fields do not match.");
    else {
      var input = JSON.stringify({
        p_font_size: v_font_size,
        p_pwd: v_pwd.value,
        p_csv_encoding: v_csv_encoding,
        p_csv_delimiter: v_csv_delimiter,
        p_indent_char: v_indent_char,
        p_indent_size: v_indent_size,
        p_comma_style: v_comma_style,
        p_keyword_case: v_keyword_case,
        p_autocomplete_disabled_types: v_autocomplete_disabled_types
      });
      execAjax("/save_config_user/", input, function(p_return) {
        $("#modal_config").modal("hide");
        showAlert("Configuration saved.");
        applyEditorTabSize();
      });
    }
  }
  function saveShortcuts() {
    var v_shortcut_list = [];
    for (var property in v_shortcut_object.shortcuts) {
      if (v_shortcut_object.shortcuts.hasOwnProperty(property)) {
        v_shortcut_list.push(v_shortcut_object.shortcuts[property]);
      }
    }
    var input = JSON.stringify({
      p_shortcuts: v_shortcut_list,
      p_current_os: v_current_os
    });
    execAjax("/save_shortcuts/", input, function(p_return) {
      showAlert("Shortcuts saved.");
    });
  }
  function editCellData$1(p_ht, p_row, p_col, p_content, p_can_alter) {
    var v_edit_modal = document.getElementById("div_edit_content");
    if (!v_edit_modal) {
      v_edit_modal = document.createElement("div");
      v_edit_modal.setAttribute("id", "div_edit_content");
      v_edit_modal.setAttribute("tabindex", "-1");
      v_edit_modal.setAttribute("role", "dialog");
      v_edit_modal.setAttribute("aria-hidden", "true");
      v_edit_modal.classList = "modal fade";
      document.body.append(v_edit_modal);
    }
    v_canEditContent = p_can_alter;
    var v_save_btn_attr = "";
    if (!v_canEditContent) {
      v_save_btn_attr = ' disabled title="Unable to manually edit data without primary key" ';
    }
    v_edit_modal.innerHTML = '<div id="modal_message_dialog" class="modal-dialog" role="document" style="width: 1200px;max-width: 90vw;"><div class="modal-content"><div class="modal-header"><h4 class="mb-0">Edit Data</h4><button type="button" class="close" data-dismiss="modal" aria-label="Close" onclick="cancelEditContent()"><span aria-hidden="true">&times;</span></button></div><div id="modal_message_content" class="modal-body" style="white-space: pre-line;"><div id="txt_edit_content" style="width: 100%; height: 70vh; font-size: 12px; border: 1px solid rgb(195, 195, 195);"></div></div><div class="modal-footer"><button ' + v_save_btn_attr + ' type="button" class="btn omnidb__theme__btn--primary" data-dismiss="modal" onclick="saveEditContent()">Save</button><button type="button" class="btn omnidb__theme__btn--secondary" data-dismiss="modal" onclick="cancelEditContent()">Cancel</button></div></div></div>';
    if (v_editContentObject != null) {
      if (v_editContentObject.editor != null) {
        v_editContentObject.editor.destroy();
        document.getElementById("txt_edit_content").innerHTML = "";
      }
    }
    ace.require("ace/ext/language_tools");
    var v_editor = ace.edit("txt_edit_content");
    v_editor.setTheme("ace/theme/" + v_editor_theme);
    v_editor.session.setMode("ace/mode/text");
    v_editor.$blockScrolling = Infinity;
    v_editor.setFontSize(Number(v_font_size));
    v_editor.session.setTabSize(v_indent_size || 4);
    v_editor.session.setUseSoftTabs(v_indent_char !== "tab");
    v_editor.setOptions({ enableBasicAutocompletion: true });
    document.getElementById("txt_edit_content").onclick = function() {
      v_editor.focus();
    };
    if (p_content != null) v_editor.setValue(String(p_content));
    else v_editor.setValue("");
    v_editor.clearSelection();
    if (p_can_alter) v_editor.setReadOnly(false);
    else v_editor.setReadOnly(true);
    v_editor.commands.bindKey("Cmd-,", null);
    v_editor.commands.bindKey("Ctrl-,", null);
    v_editor.commands.bindKey("Cmd-Delete", null);
    v_editor.commands.bindKey("Ctrl-Delete", null);
    v_editContentObject = new Object();
    v_editContentObject.editor = v_editor;
    v_editContentObject.row = p_row;
    v_editContentObject.col = p_col;
    v_editContentObject.ht = p_ht;
    $("#div_edit_content").modal({
      backdrop: "static",
      keyboard: false
    });
    $("#div_edit_content").modal("show");
  }
  function saveEditContent() {
    $("#div_edit_content").modal("hide");
    if (v_canEditContent) {
      v_editContentObject.ht.setDataAtCell(
        v_editContentObject.row,
        v_editContentObject.col,
        v_editContentObject.editor.getValue()
      );
    } else {
      alert("No permissions.");
    }
    v_editContentObject.editor.setValue("");
  }
  function cancelEditContent() {
    $("#div_edit_content").modal("hide");
    v_editContentObject.editor.setValue("");
  }
  function hideEditContent() {
    $("#div_edit_content").modal("hide");
    if (v_canEditContent)
      v_editContentObject.ht.setDataAtCell(
        v_editContentObject.row,
        v_editContentObject.col,
        v_editContentObject.editor.getValue()
      );
    v_editContentObject.editor.setValue("");
  }
  const headerActions = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    adjustChartTheme,
    adjustGraphTheme,
    applyEditorTabSize,
    cancelEditContent,
    changeFontSize,
    changeInterfaceFontSize,
    changeTheme,
    confirmSignout,
    editCellData: editCellData$1,
    goToConnections,
    hideEditContent,
    saveConfigUser,
    saveEditContent,
    saveShortcuts,
    setAllAutocompleteTypeCheckboxes,
    showAbout,
    showConfigUser,
    showWebsite,
    updateIndentUnit,
    get v_current_terminal_theme() {
      return v_current_terminal_theme$1;
    },
    v_dark_terminal_theme,
    v_light_terminal_theme
  }, Symbol.toStringTag, { value: "Module" }));
  var v_queryState$1 = {
    Idle: 0,
    Executing: 1,
    Ready: 2
  };
  var v_queryRequestCodes$1 = {
    Login: 0,
    Query: 1,
    Execute: 2,
    Script: 3,
    QueryEditData: 4,
    SaveEditData: 5,
    CancelThread: 6,
    CloseTab: 8,
    AdvancedObjectSearch: 9,
    Console: 10,
    Terminal: 11,
    Ping: 12
  };
  var v_queryResponseCodes = {
    LoginResult: 0,
    QueryResult: 1,
    QueryEditDataResult: 2,
    SaveEditDataResult: 3,
    SessionMissing: 4,
    PasswordRequired: 5,
    QueryAck: 6,
    MessageException: 7,
    RemoveContext: 9,
    AdvancedObjectSearchResult: 10,
    ConsoleResult: 11,
    TerminalResult: 12,
    Pong: 13
  };
  function escapeHtml$1(p_str) {
    var v_div = document.createElement("div");
    v_div.appendChild(document.createTextNode(String(p_str)));
    return v_div.innerHTML;
  }
  Number.prototype.padLeft = function(base, chr) {
    var len = String(base || 10).length - String(this).length + 1;
    return len > 0 ? new Array(len).join(chr || "0") + this : this;
  };
  function cancelSQL(p_tab_tag) {
    var v_tab_tag;
    if (p_tab_tag) v_tab_tag = p_tab_tag;
    else v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;
    createRequest(v_queryRequestCodes$1.CancelThread, v_tab_tag.tab_id);
    cancelSQLTab();
  }
  function cancelSQLTab(p_tab_tag) {
    var v_tab_tag;
    if (p_tab_tag) v_tab_tag = p_tab_tag;
    else v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;
    if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor) {
      v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setReadOnly(false);
    }
    v_tab_tag.state = v_queryState$1.Idle;
    v_tab_tag.tab_loading_span.style.visibility = "hidden";
    v_tab_tag.tab_check_span.style.display = "none";
    v_tab_tag.bt_cancel.style.display = "none";
    v_tab_tag.query_info.innerHTML = "Canceled.";
    setTabStatus(v_tab_tag, 0);
    removeContext(v_tab_tag.context.v_context_code);
    SetAcked(v_tab_tag.context);
  }
  function getQueryEditorValue() {
    var v_selected_text = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.getSelectedText();
    if (v_selected_text != "") return v_selected_text;
    else return v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.getValue();
  }
  function destructiveSQLWarning(p_sql) {
    var v_stripped = p_sql;
    for (; ; ) {
      v_stripped = v_stripped.replace(/^[\s\r\n]+/, "");
      if (v_stripped.indexOf("--") === 0) {
        var v_newline = v_stripped.indexOf("\n");
        if (v_newline < 0) {
          v_stripped = "";
          break;
        }
        v_stripped = v_stripped.substring(v_newline + 1);
        continue;
      }
      if (v_stripped.indexOf("/*") === 0) {
        var v_end = v_stripped.indexOf("*/");
        if (v_end < 0) {
          v_stripped = "";
          break;
        }
        v_stripped = v_stripped.substring(v_end + 2);
        continue;
      }
      break;
    }
    var v_upper = v_stripped.toUpperCase();
    if (/^(DROP|TRUNCATE)\b/.test(v_upper)) {
      return "This statement is destructive and cannot be undone. Run it anyway?";
    }
    if (/^(DELETE|UPDATE)\b/.test(v_upper) && !/\bWHERE\b/.test(v_upper)) {
      return "This statement has no WHERE clause and will affect ALL rows. Run it anyway?";
    }
    return null;
  }
  function querySQL$1(p_mode, p_all_data = false, p_query = getQueryEditorValue(), p_callback = null, p_log_query = true, p_save_query = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.getValue(), p_cmd_type = null, p_clear_data = false, p_tab_title = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.tab_title_span.innerHTML) {
    var v_run = function() {
      executeQuerySQL(p_mode, p_all_data, p_query, p_callback, p_log_query, p_save_query, p_cmd_type, p_clear_data, p_tab_title);
    };
    var v_warning = p_mode == 0 ? destructiveSQLWarning(p_query) : null;
    if (v_warning) {
      showConfirm(v_warning, v_run);
    } else {
      v_run();
    }
  }
  function executeQuerySQL(p_mode, p_all_data, p_query, p_callback, p_log_query, p_save_query, p_cmd_type, p_clear_data, p_tab_title) {
    var v_state = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.state;
    if (v_state != v_queryState$1.Idle) {
      showAlert("Tab with activity in progress.");
    } else {
      var v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;
      v_tab_tag.tempData = [];
      var v_sql_value = p_query;
      var v_db_index = v_connTabControl.selectedTab.tag.selectedDatabaseIndex;
      v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.tab_loading_span;
      v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.tab_close_span;
      if (v_sql_value.trim() == "") {
        showAlert("Please provide a string.");
      } else {
        if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.currDatabaseIndex == null || v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.currDatabaseIndex != v_connTabControl.selectedTab.tag.selectedDatabaseIndex) {
          p_mode = 0;
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.currDatabaseIndex = v_connTabControl.selectedTab.tag.selectedDatabaseIndex;
        }
        var v_message_data = {
          v_sql_cmd: v_sql_value,
          v_sql_save: p_save_query,
          v_cmd_type: p_cmd_type,
          v_db_index,
          v_conn_tab_id: v_connTabControl.selectedTab.id,
          v_tab_id: v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.tab_id,
          v_tab_db_id: v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.tab_db_id,
          v_mode: p_mode,
          v_all_data: p_all_data,
          v_log_query: p_log_query,
          v_tab_title: p_tab_title,
          v_autocommit: v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.check_autocommit.checked
        };
        if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor) {
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setReadOnly(true);
        }
        v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.state = v_queryState$1.Executing;
        (/* @__PURE__ */ new Date()).getTime();
        var d = /* @__PURE__ */ new Date(), dformat = [(d.getMonth() + 1).padLeft(), d.getDate().padLeft(), d.getFullYear()].join("/") + " " + [d.getHours().padLeft(), d.getMinutes().padLeft(), d.getSeconds().padLeft()].join(":");
        v_tab_tag.tab_loading_span.style.visibility = "visible";
        v_tab_tag.bt_cancel.style.display = "inline-block";
        v_tab_tag.bt_fetch_more.style.display = "none";
        v_tab_tag.bt_fetch_all.style.display = "none";
        v_tab_tag.bt_commit.style.display = "none";
        v_tab_tag.bt_rollback.style.display = "none";
        v_tab_tag.div_notices.innerHTML = "";
        setTabStatus(v_tab_tag, 2);
        var v_has_selected_text = false;
        if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.getSelectedText() != "")
          v_has_selected_text = true;
        var v_context = {
          tab_tag: v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag,
          start_time: (/* @__PURE__ */ new Date()).getTime(),
          start_datetime: dformat,
          cmd_type: p_cmd_type,
          database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
          mode: p_mode,
          has_selected_text: v_has_selected_text,
          callback: p_callback,
          acked: false,
          all_data: p_all_data,
          query: p_query,
          log_query: p_log_query,
          save_query: p_save_query,
          clear_data: p_clear_data,
          tab_title: p_tab_title
        };
        v_context.tab_tag.context = v_context;
        if (p_mode == 0 && p_callback == null || p_clear_data) {
          if (v_context.tab_tag.ht != null) {
            v_context.tab_tag.ht.destroy();
            v_context.tab_tag.ht = null;
          }
          v_context.tab_tag.div_result.innerHTML = "";
        }
        v_context.tab_tag.query_info.innerHTML = "<b>Start time</b>: " + escapeHtml$1(String(dformat)) + "<br><b>Running...</b>";
        createRequest(v_queryRequestCodes$1.Query, v_message_data, v_context);
      }
    }
  }
  function checkQueryStatus$1(p_tab) {
    if (p_tab.tag.state == v_queryState$1.Ready) {
      querySQLReturnRender(p_tab.tag.data, p_tab.tag.context);
    }
  }
  function querySQLReturn(p_data, p_context) {
    if (p_data.v_data.v_inserted_id) {
      p_context.tab_tag.tab_db_id = p_data.v_data.v_inserted_id;
    }
    if (!p_data.v_error) p_data.v_data.v_data = p_context.tab_tag.tempData;
    p_context.tab_tag.tempData = [];
    if (p_context.tab_tag.state != v_queryState$1.Idle) {
      if (p_context.tab_tag.tab_id == p_context.tab_tag.tabControl.selectedTab.id && p_context.tab_tag.connTab.id == p_context.tab_tag.connTab.tag.connTabControl.selectedTab.id) {
        querySQLReturnRender(p_data, p_context);
      } else {
        p_context.tab_tag.state = v_queryState$1.Ready;
        p_context.tab_tag.context = p_context;
        p_context.tab_tag.data = p_data;
        p_context.tab_tag.tab_loading_span.style.visibility = "hidden";
        p_context.tab_tag.tab_check_span.style.display = "";
      }
    }
  }
  function setTabStatus(p_tab_tag, p_con_status) {
    if (p_con_status == 0) {
      p_tab_tag.query_tab_status_text.innerHTML = "Not connected";
      p_tab_tag.query_tab_status.className = "fas fa-dot-circle tab-status tab-status-closed";
      p_tab_tag.query_tab_status.title = "Not connected";
      p_tab_tag.query_tab_status.innerHTML = "";
    } else if (p_con_status == 1) {
      p_tab_tag.query_tab_status_text.innerHTML = "Idle";
      p_tab_tag.query_tab_status.className = "fas fa-dot-circle tab-status tab-status-idle position-relative";
      p_tab_tag.query_tab_status.title = "Idle";
      p_tab_tag.query_tab_status.innerHTML = '<div style="position: absolute; width: 12px; height: 12px; overflow: visible; left: 0px; top: 0px; display: block;"><span class="omnis__circle-waves omnis__circle-waves--idle"><span></span><span></span><span></span><span></span></span></div>';
    } else if (p_con_status == 2) {
      p_tab_tag.query_tab_status_text.innerHTML = "Running";
      p_tab_tag.query_tab_status.className = "fas fa-dot-circle tab-status tab-status-running position-relative";
      p_tab_tag.query_tab_status.title = "Running";
      p_tab_tag.query_tab_status.innerHTML = '<div style="position: absolute; width: 12px; height: 12px; overflow: visible; left: 0px; top: 0px; display: block;"><span class="omnis__circle-waves omnis__circle-waves--running"><span></span><span></span><span></span><span></span></span></div>';
    } else if (p_con_status == 3) {
      p_tab_tag.query_tab_status_text.innerHTML = "Idle in transaction";
      p_tab_tag.query_tab_status.className = "fas fa-dot-circle tab-status tab-status-idle_in_transaction";
      p_tab_tag.query_tab_status.title = "Idle in transaction";
      p_tab_tag.query_tab_status.innerHTML = "";
    } else if (p_con_status == 4) {
      p_tab_tag.query_tab_status_text.innerHTML = "Idle in transaction (aborted)";
      p_tab_tag.query_tab_status.className = "fas fa-dot-circle tab-status tab-status-idle_in_transaction_aborted";
      p_tab_tag.query_tab_status.title = "Idle in transaction (aborted)";
      p_tab_tag.query_tab_status.innerHTML = "";
    }
  }
  function querySQLReturnRender(p_message, p_context) {
    p_context.tab_tag.state = v_queryState$1.Idle;
    p_context.tab_tag.context = null;
    p_context.tab_tag.data = null;
    if (p_context.tab_tag.editor) {
      p_context.tab_tag.editor.setReadOnly(false);
    }
    var v_div_result = p_context.tab_tag.div_result;
    var v_query_info = p_context.tab_tag.query_info;
    var v_data = p_message.v_data;
    if (v_data.v_con_status == 3 || v_data.v_con_status == 4) {
      p_context.tab_tag.bt_commit.style.display = "";
      p_context.tab_tag.bt_rollback.style.display = "";
    } else {
      p_context.tab_tag.bt_commit.style.display = "none";
      p_context.tab_tag.bt_rollback.style.display = "none";
    }
    setTabStatus(p_context.tab_tag, p_message.v_data.v_con_status);
    if (p_context.callback != null) {
      if (p_message.v_error) {
        v_div_result.innerHTML = '<div class="error_text">' + escapeHtml$1(p_message.v_data.message) + "</div>";
        v_query_info.innerHTML = "<b>Start time</b>: " + escapeHtml$1(String(p_context.start_datetime)) + " <b>Duration</b>: " + escapeHtml$1(String(p_message.v_data.v_duration));
      } else {
        v_query_info.innerHTML = "<b>Start time</b>: " + escapeHtml$1(String(p_context.start_datetime)) + " <b>Duration</b>: " + escapeHtml$1(String(p_message.v_data.v_duration));
        p_context.callback(p_message);
      }
    } else {
      p_context.tab_tag.selectDataTabFunc();
      if (p_context.tab_tag.div_count_notices) {
        p_context.tab_tag.div_count_notices.style.display = "none";
      }
      if (v_data.v_notices_length > 0) {
        if (p_context.tab_tag.div_count_notices) {
          p_context.tab_tag.div_count_notices.innerHTML = v_data.v_notices_length;
          p_context.tab_tag.div_count_notices.style.display = "inline-block";
          p_context.tab_tag.div_notices.textContent = v_data.v_notices;
        }
      }
      if (p_message.v_error) {
        v_div_result.innerHTML = '<div class="error_text">' + escapeHtml$1(p_message.v_data.message) + "</div>";
        v_query_info.innerHTML = "<b>Start time</b>: " + escapeHtml$1(String(p_context.start_datetime)) + " <b>Duration</b>: " + escapeHtml$1(String(p_message.v_data.v_duration));
        if (p_message.v_data.position != null) {
          if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor && !p_context.has_selected_text) {
            v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(
              p_message.v_data.position.row,
              p_message.v_data.position.col
            );
            v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.textInput.focus();
          }
        }
      } else {
        if (p_context.sel_value == 0) {
          v_query_info.innerHTML = "<b>Start time</b>: " + escapeHtml$1(String(p_context.start_datetime)) + " <b>Duration</b>: " + escapeHtml$1(String(p_message.v_data.v_duration));
          v_div_result.innerHTML = '<div class="query_info">' + escapeHtml$1(p_message.v_data.v_data) + "</div>";
        } else {
          if (v_data.v_data.length >= 50 && p_context.mode != 2) {
            if (p_context.tab_tag.bt_fetch_more) {
              p_context.tab_tag.bt_fetch_more.style.display = "";
            }
            if (p_context.tab_tag.bt_fetch_all) {
              p_context.tab_tag.bt_fetch_all.style.display = "";
            }
          } else {
            if (p_context.tab_tag.bt_fetch_more) {
              p_context.tab_tag.bt_fetch_more.style.display = "none";
            }
            if (p_context.tab_tag.bt_fetch_all) {
              p_context.tab_tag.bt_fetch_all.style.display = "none";
            }
          }
          if (p_context.mode == 0) {
            v_div_result.innerHTML = "";
            window.scrollTo(0, 0);
            if (v_data.v_data.length == 0 && v_data.v_col_names.length == 0) {
              v_query_info.innerHTML = "<b>Start time</b>: " + escapeHtml$1(String(p_context.start_datetime)) + " <b>Duration</b>: " + escapeHtml$1(String(p_message.v_data.v_duration));
              if (typeof p_message.v_data.v_status == "string")
                v_div_result.innerHTML = '<div class="query_info">' + escapeHtml$1(p_message.v_data.v_status) + "</div>";
              else v_div_result.innerHTML = '<div class="query_info">Done</div>';
            } else {
              v_query_info.innerHTML = "<span class='omnidb__query-info__value' style='font-weight: 900;'>" + v_data.v_data.length + "</span><span> rows</span><span> in </span><span class='omnidb__query-info__value' style='font-weight: 600;'>" + escapeHtml$1(String(p_message.v_data.v_duration)) + "</span><br/><span>Start time</span>: <span class='omnidb__query-info__value' style='font-weight: 600;'>" + escapeHtml$1(String(p_context.start_datetime)) + "</span>";
              var columnProperties = [];
              for (var i2 = 0; i2 < v_data.v_col_names.length; i2++) {
                var col = new Object();
                col.readOnly = true;
                col.title = v_data.v_col_names[i2];
                if (i2 === 0) {
                  col.pinned = "left";
                }
                var colType = v_data.v_col_types && v_data.v_col_types[i2] ? v_data.v_col_types[i2] : null;
                if (colType) {
                  col.tooltip = v_data.v_col_names[i2] + " [" + colType + "]";
                  var typeUpper = String(colType).toUpperCase();
                  if (/^(INT2|INT4|INT8|SMALLINT|INTEGER|BIGINT|TINYINT|MEDIUMINT|OID|INT|NUMERIC|DECIMAL|DEC|REAL|FLOAT|FLOAT4|FLOAT8|DOUBLE|MONEY|NUMBER|BINARY_FLOAT|BINARY_DOUBLE)$/.test(typeUpper)) {
                    col.align = "right";
                  } else if (/^(BOOL|BOOLEAN|BIT)$/.test(typeUpper)) {
                    col.align = "center";
                  } else if (/^(CHAR|BPCHAR)$/.test(typeUpper)) {
                    col.align = "center";
                  }
                } else {
                  col.tooltip = v_data.v_col_names[i2];
                }
                columnProperties.push(col);
              }
              var container = v_div_result;
              p_context.tab_tag.ht = new Handsontable(container, {
                licenseKey: "non-commercial-and-evaluation",
                data: v_data.v_data,
                columns: columnProperties,
                colHeaders: true,
                rowHeaders: true,
                // stretchH: 'last',
                autoRowSize: false,
                //copyRowsLimit : 1000000000,
                //copyColsLimit : 1000000000,
                copyPaste: { pasteMode: "", rowsLimit: 1e9, columnsLimit: 1e9 },
                manualColumnResize: true,
                // modifyColWidth: function(width, col){
                //   if(width > 300){
                //     return 280
                //   }
                // },
                fillHandle: false,
                contextMenu: {
                  callback: function(key, options) {
                    if (key === "view_data") {
                      editCellData(
                        this,
                        options[0].start.row,
                        options[0].start.col,
                        this.getDataAtCell(options[0].start.row, options[0].start.col),
                        false
                      );
                    } else if (key === "copy") {
                      var v_start_row = Math.min(options[0].start.row, options[0].end.row);
                      var v_end_row = Math.max(options[0].start.row, options[0].end.row);
                      var v_start_col = Math.min(options[0].start.col, options[0].end.col);
                      var v_end_col = Math.max(options[0].start.col, options[0].end.col);
                      var v_ht = this;
                      var v_lines = [];
                      for (var v_row = v_start_row; v_row <= v_end_row; v_row++) {
                        var v_cells = [];
                        for (var v_col = v_start_col; v_col <= v_end_col; v_col++) {
                          var v_cell_value = v_ht.getDataAtCell(v_row, v_col);
                          v_cells.push(v_cell_value == null ? "" : String(v_cell_value));
                        }
                        v_lines.push(v_cells.join("	"));
                      }
                      uiCopyTextToClipboard(v_lines.join("\n"));
                    }
                  },
                  items: {
                    copy: {
                      name: '<div style="position: absolute;"><i class="fas fa-copy cm-all" style="vertical-align: middle;"></i></div><div style="padding-left: 30px;">Copy</div>'
                    },
                    view_data: {
                      name: '<div style="position: absolute;"><i class="fas fa-edit cm-all" style="vertical-align: middle;"></i></div><div style="padding-left: 30px;">View Content</div>'
                    }
                  }
                },
                cells: function(row, col2, prop) {
                  var cellProperties = {};
                  cellProperties.renderer = whiteRenderer;
                  return cellProperties;
                }
              });
            }
          } else if (p_context.mode == 1 || p_context.mode == 2) {
            v_new_data = p_context.tab_tag.ht.getSourceData();
            v_query_info.innerHTML = "<span class='omnidb__query-info__value' style='font-weight: 900;'>" + (v_new_data.length + v_data.v_data.length) + "</span><span> rows</span><span> in </span><span class='omnidb__query-info__value' style='font-weight: 600;'>" + escapeHtml$1(String(p_message.v_data.v_duration)) + "</span><br/><span>Start time</span>: <span class='omnidb__query-info__value' style='font-weight: 600;'>" + escapeHtml$1(String(p_context.start_datetime)) + "</span>";
            for (var i2 = 0; i2 < v_data.v_data.length; i2++) {
              v_new_data.push(v_data.v_data[i2]);
            }
            p_context.tab_tag.ht.loadData(v_new_data);
            v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result.childNodes[0].childNodes[0].scrollTop = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result.childNodes[0].childNodes[0].scrollHeight;
          } else {
            if (p_context.tab_tag.ht != null)
              v_query_info.innerHTML = "<b>Start time</b>: " + escapeHtml$1(String(p_context.start_datetime)) + " <b>Duration</b>: " + escapeHtml$1(String(p_message.v_data.v_duration)) + "<br/>Status: " + escapeHtml$1(p_message.v_data.v_status);
            else {
              v_query_info.innerHTML = "<b>Start time</b>: " + escapeHtml$1(String(p_context.start_datetime)) + " <b>Duration</b>: " + escapeHtml$1(String(p_message.v_data.v_duration));
              v_div_result.innerHTML = '<div class="query_info">' + escapeHtml$1(p_message.v_data.v_status) + "</div>";
            }
          }
        }
      }
    }
    p_context.tab_tag.tab_loading_span.style.visibility = "hidden";
    p_context.tab_tag.tab_check_span.style.display = "none";
    p_context.tab_tag.bt_cancel.style.display = "none";
  }
  function queryError(p_message, p_context) {
    var v_tab_tag = p_context.tab_tag;
    v_tab_tag.state = v_queryState$1.Idle;
    v_tab_tag.context = null;
    v_tab_tag.data = null;
    if (v_tab_tag.editor) {
      v_tab_tag.editor.setReadOnly(false);
    }
    v_tab_tag.bt_commit.style.display = "none";
    v_tab_tag.bt_rollback.style.display = "none";
    setTabStatus(v_tab_tag, 1);
    v_tab_tag.div_notices.innerHTML = '<div class="error_text">' + escapeHtml$1(p_message.v_data) + "</div>";
    if (v_tab_tag.div_count_notices) {
      v_tab_tag.div_count_notices.innerHTML = 1;
      v_tab_tag.div_count_notices.style.display = "inline-block";
    }
    v_tab_tag.selectMessageTabFunc();
    v_tab_tag.query_info.innerHTML = "<b>Start time</b>: " + escapeHtml$1(String(p_context.start_datetime)) + "<br><b>Error</b>";
    v_tab_tag.tab_loading_span.style.visibility = "hidden";
    v_tab_tag.tab_check_span.style.display = "none";
    v_tab_tag.bt_cancel.style.display = "none";
  }
  const query = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    cancelSQL,
    cancelSQLTab,
    checkQueryStatus: checkQueryStatus$1,
    destructiveSQLWarning,
    escapeHtml: escapeHtml$1,
    executeQuerySQL,
    getQueryEditorValue,
    queryError,
    querySQL: querySQL$1,
    querySQLReturn,
    querySQLReturnRender,
    setTabStatus,
    v_queryRequestCodes: v_queryRequestCodes$1,
    v_queryResponseCodes,
    v_queryState: v_queryState$1
  }, Symbol.toStringTag, { value: "Module" }));
  function customMenu$1(p_position, p_menu, p_object) {
    var v_outer_div = createSimpleElement("div", "ul_cm_overlay", "aimara_menu__overlay");
    var v_div = createSimpleElement("ul", "ul_cm", "aimara_menu");
    var v_closediv = createSimpleElement("div", "close_cm", "div_close_cm");
    v_closediv.onmousedown = function() {
      v_div.parentNode.removeChild(v_div);
      this.parentNode.removeChild(this);
      v_outer_div.parentNode.removeChild(v_outer_div);
    };
    v_closediv.oncontextmenu = function(e) {
      e.preventDefault();
      e.stopPropagation();
      v_div.parentNode.removeChild(v_div);
      this.parentNode.removeChild(this);
      v_outer_div.parentNode.removeChild(v_outer_div);
    };
    v_outer_div.appendChild(v_div);
    v_outer_div.appendChild(v_closediv);
    document.body.appendChild(v_outer_div);
    v_div.innerHTML = "";
    var v_left = p_position.x - 5;
    var v_right = p_position.y - 5;
    v_div.style.display = "block";
    v_div.style.position = "absolute";
    v_div.style.left = v_left + "px";
    v_div.style.top = v_right + "px";
    for (var i2 = 0; i2 < p_menu.length; i2++)
      (function(i3) {
        var v_li = createSimpleElement("li", null, null);
        v_li.aimara_level = 0;
        var v_span = createSimpleElement("span", null, null);
        v_span.onmousedown = function() {
          v_div.parentNode.removeChild(v_div);
          v_closediv.parentNode.removeChild(v_closediv);
          v_outer_div.parentNode.removeChild(v_outer_div);
          if (p_menu[i3].action != null) p_menu[i3].action(p_object);
        };
        var v_a = createSimpleElement("a", null, null);
        var v_ul = createSimpleElement("ul", null, "aimara_sub-menu");
        v_ul.aimara_level = 0;
        v_a.innerHTML = p_menu[i3].text;
        v_li.appendChild(v_span);
        if (p_menu[i3].icon != void 0) {
          var v_img = createSimpleElement("i", null, p_menu[i3].icon);
          v_img.innerHTML = "&nbsp;";
          v_li.appendChild(v_img);
        }
        v_li.appendChild(v_a);
        v_div.appendChild(v_li);
        if (p_menu[i3].submenu != void 0) {
          v_li.onmouseenter = function() {
            var v_submenus = document.getElementsByClassName("aimara_sub-menu");
            for (var k = 0; k < v_submenus.length; k++) {
              if (v_submenus[k].aimara_level >= this.aimara_level) v_submenus[k].style.display = "none";
            }
            v_ul.style.display = "block";
            v_ul.style["z-index"] = this.aimara_level + 1;
            custoMenuRepositionSubmenu(v_ul);
          };
          v_li.appendChild(v_ul);
          var v_span_more = createSimpleElement("div", null, null);
          v_span_more.appendChild(createImgElement(null, "menu_img", v_url_folder + "/static/OmniDB_app/images/right.png"));
          v_li.appendChild(v_span_more);
          customMenuRecursive(p_menu[i3].submenu.elements, v_ul, p_object, v_closediv, v_div, 1, v_outer_div);
        }
      })(i2);
    customMenuReposition(v_div);
  }
  function customMenuRecursive(p_submenu, p_ul, p_object, p_closediv, p_cm_div, p_level, p_outer_div) {
    for (var i2 = 0; i2 < p_submenu.length; i2++)
      (function(i3) {
        var v_li = createSimpleElement("li", null, null);
        v_li.aimara_level = p_level;
        var v_span = createSimpleElement("span", null, null);
        v_span.onmousedown = function() {
          p_cm_div.parentNode.removeChild(p_cm_div);
          p_closediv.parentNode.removeChild(p_closediv);
          p_outer_div.parentNode.removeChild(p_outer_div);
          if (p_submenu[i3].action != null) p_submenu[i3].action(p_object);
        };
        var v_a = createSimpleElement("a", null, null);
        var v_ul = createSimpleElement("ul", null, "aimara_sub-menu");
        v_ul.aimara_level = p_level;
        v_a.innerHTML = p_submenu[i3].text;
        v_li.appendChild(v_span);
        if (p_submenu[i3].icon != void 0) {
          var v_img = createSimpleElement("i", null, p_submenu[i3].icon);
          v_img.innerHTML = "&nbsp;";
          v_li.appendChild(v_img);
        }
        v_li.appendChild(v_a);
        p_ul.appendChild(v_li);
        if (p_submenu[i3].submenu != void 0) {
          v_li.onmouseenter = function() {
            var v_submenus = document.getElementsByClassName("aimara_sub-menu");
            for (var k = 0; k < v_submenus.length; k++) {
              if (v_submenus[k].aimara_level >= this.aimara_level) v_submenus[k].style.display = "none";
            }
            v_ul.style.display = "block";
            v_ul.style["z-index"] = this.aimara_level + 1;
            custoMenuRepositionSubmenu(v_ul);
          };
          v_li.appendChild(v_ul);
          var v_span_more = createSimpleElement("div", null, null);
          v_span_more.appendChild(createImgElement(null, "menu_img", v_url_folder + "/static/OmniDB_app/images/right.png"));
          v_li.appendChild(v_span_more);
          customMenuRecursive(p_submenu[i3].submenu.elements, v_ul, p_object, p_closediv, p_cm_div, p_level + 1, p_outer_div);
        }
      })(i2);
  }
  function customMenuReposition(p_div) {
    var v_div = p_div;
    let v_div_rect = v_div.getBoundingClientRect();
    let v_div_h_diff = v_div_rect.x + v_div_rect.width - window.innerWidth;
    if (v_div_h_diff > 0) {
      v_div.style.left = v_div_rect.x - v_div_h_diff - 5 + "px";
      v_div.classList.add("aimara_menu_left");
    }
    let v_div_y = v_div_rect.y;
    let v_div_v_diff = v_div_y + v_div_rect.height - window.innerHeight;
    if (v_div_v_diff > 0) {
      let v_div_v_fits = v_div_rect.height - window.innerHeight <= 5;
      if (!v_div_v_fits) {
        v_div.style.top = "5px";
      } else {
        v_div.style.top = v_div_y - v_div_v_diff - 5 + "px";
      }
    }
    document.getElementById("close_cm").style.height = document.getElementById("ul_cm_overlay").scrollHeight + "px";
  }
  function custoMenuRepositionSubmenu(p_ul) {
    var v_ul = p_ul;
    let v_ul_rect = v_ul.getBoundingClientRect();
    let v_ul_h_diff = v_ul_rect.x + v_ul_rect.width - window.innerWidth;
    if (v_ul_h_diff > 0) {
      v_ul.classList.add("aimara_menu_left");
    }
    let v_ul_y = v_ul_rect.y;
    let v_ul_v_diff = v_ul_y + v_ul_rect.height - window.innerHeight;
    if (v_ul_v_diff > 0) {
      let v_ul_v_fits = v_ul_rect.height - window.innerHeight <= 5;
      if (!v_ul_v_fits) {
        v_ul.style.top = -1 * v_ul_y + 5 + "px";
      } else {
        v_ul.style.top = -1 * v_ul_v_diff - 5 + "px";
      }
    }
    document.getElementById("close_cm").style.height = document.getElementById("ul_cm_overlay").scrollHeight + "px";
  }
  const customMenu$2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    custoMenuRepositionSubmenu,
    customMenu: customMenu$1,
    customMenuRecursive,
    customMenuReposition
  }, Symbol.toStringTag, { value: "Module" }));
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
  function showError$1(p_message) {
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
  function showConfirm$1(p_info, p_funcYes = null, p_funcNo = null, p_shownCallback = null, p_large = null) {
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
  function showConfirm3$1(p_info, p_funcYes, p_funcNo) {
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
    showConfirm: showConfirm$1,
    showConfirm2,
    showConfirm3: showConfirm3$1,
    showError: showError$1,
    showMessageModal
  }, Symbol.toStringTag, { value: "Module" }));
  var toggleSnippetPanel = function(p_set_state = false) {
    v_element = $("#" + v_connTabControl.snippet_tag.divPanel.getAttribute("id"));
    v_connTabControl.snippet_tag;
    let v_set_state = p_set_state;
    if (v_set_state === "visible") {
      v_element.addClass("omnidb__panel--slide-in");
    } else if (v_set_state === "hidden") {
      v_element.removeClass("omnidb__panel--slide-in");
    } else {
      v_element.toggleClass("omnidb__panel--slide-in");
    }
    resizeSnippetPanel();
  };
  var v_createSnippetPanelFunction = function(p_index) {
    var v_tab = v_connTabControl.createTab({
      p_icon: `<i class="fas fa-book"></i>`,
      p_name: `Snippets`,
      p_close: false,
      p_selectable: false,
      p_clickFunction: function() {
        toggleSnippetPanel();
      },
      p_omnidb_tooltip_name: '<h5 class="my-1">Snippets Panel</h5>'
    });
    v_connTabControl.selectTab(v_tab);
    var v_html = "<div id='" + v_tab.id + "_panel_snippet' class='omnidb__panel omnidb__panel--snippet'><button type='button' onclick='toggleSnippetPanel()' class='px-4 btn omnidb__theme__btn--secondary omnidb__panel__toggler'><i class='fas fa-arrows-alt-v'></i></button><div class='container-fluid h-100' style='position: relative;'><div id='" + v_tab.id + "_snippet_div_layout_grid' class='d-flex h-100'><div id='" + v_tab.id + "_snippet_div_left' class='omnidb__snippets__div-left h-100' style='width: 300px; flex-shrink: 0;'><div class='h-100'><div class='omnidb__snippets__content-left h-100 d-flex flex-column'><div id='" + v_tab.id + "_snippet_tree' style='overflow: auto; flex-grow: 1; transition: scroll 0.3s;'></div></div></div><div class='resize_line_vertical omnidb__resize-line__container' onmousedown='resizeSnippetHorizontal(event)' style='position:absolute;height: 100%;width: 10px;cursor: ew-resize;border-right: 1px dashed #acc4e8;top: 0px;right: 0px;z-index: 10;'></div></div><div id='" + v_tab.id + "_snippet_div_right' class='omnidb__snippets__div-right pt-0 flex-grow-1' style='position: relative;'><div id='" + v_tab.id + "_snippet_tabs' class='w-100'></div></div></div></div></div>";
    v_connTabControl.snippet_div = document.createElement("div");
    v_connTabControl.snippet_div.id = v_tab.id + "_snippet";
    v_connTabControl.snippet_div.innerHTML = v_html;
    document.getElementById(v_connTabControl.id).append(v_connTabControl.snippet_div);
    var v_currTabControl = createTabControl({
      p_div: v_tab.id + "_snippet_tabs",
      p_hierarchy: "secondary"
    });
    v_currTabControl.createTab({
      p_name: "+",
      p_close: false,
      p_selectable: false,
      p_clickFunction: function(e) {
        showMenuNewTab(e);
      }
    });
    var v_tag = {
      tab_id: v_tab.id,
      tabControl: v_currTabControl,
      tabTitle: "teste",
      divLayoutGrid: document.getElementById(v_tab.id + "_snippet_div_layout_grid"),
      divLeft: document.getElementById(v_tab.id + "_snippet_div_left"),
      divPanel: document.getElementById(v_tab.id + "_panel_snippet"),
      divRight: document.getElementById(v_tab.id + "_snippet_div_right"),
      divTree: document.getElementById(v_tab.id + "_snippet_tree"),
      connTabControl: v_connTabControl,
      isVisible: false,
      mode: "snippets"
    };
    v_tab.tag = v_tag;
    v_connTabControl.snippet_tag = v_tag;
    getTreeSnippets(v_tag.divTree.id);
    if (v_connTabControl.snippet_tag.tabControl.tabList.length > 0) {
      v_connTabControl.snippet_tag.tabControl.selectTab(v_connTabControl.snippet_tag.tabControl.tabList[0]);
    }
    v_connTabControl.tag.createSnippetTextTab();
    v_connTabControl.snippet_tag.tabControl.selectedTab.tag.editor.setValue("");
    v_connTabControl.snippet_tag.tabControl.selectedTab.tag.editor.clearSelection();
    v_connTabControl.snippet_tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
  };
  const outerSnippetPanel = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    toggleSnippetPanel,
    v_createSnippetPanelFunction
  }, Symbol.toStringTag, { value: "Module" }));
  $(function() {
    $("#modal_password").on("hidden.bs.modal", function(e) {
      if (v_modal_password_ok_clicked != true && v_modal_password_cancel_callback != null) {
        v_modal_password_cancel_callback();
      } else if (v_modal_password_ok_clicked == true && v_modal_password_ok_after_hide_function != null) {
        v_modal_password_ok_after_hide_function();
      }
    });
    $("#modal_password").on("shown.bs.modal", function(e) {
      if (v_modal_password_input != null) {
        v_modal_password_input.focus();
        v_modal_password_input.onkeydown = function(event2) {
          if (event2.keyCode == 13) {
            v_modal_password_ok_function();
            $("#modal_password").modal("hide");
          }
        };
      }
    });
    v_modal_password_ok_clicked = false;
    v_modal_password_ok_function = null;
    v_modal_password_ok_after_hide_function = null;
    v_modal_password_cancel_callback = null;
    v_modal_password_input = null;
  });
  function showPasswordPrompt$1(p_database_index, p_callback_function, p_cancel_callback_function, p_message, p_send_tab_id = true) {
    v_modal_password_ok_clicked = false;
    v_modal_password_cancel_callback = p_cancel_callback_function;
    var v_content_div = document.getElementById("modal_password_content");
    var v_button_ok = document.getElementById("modal_password_ok");
    var v_button_cancel = document.getElementById("modal_password_cancel");
    v_modal_password_input = document.getElementById("txt_password_prompt");
    if (p_message) v_content_div.textContent = p_message;
    $("#modal_password").modal("show");
    v_modal_password_ok_function = function() {
      v_modal_password_ok_clicked = true;
      checkPasswordPrompt(p_database_index, p_callback_function, p_cancel_callback_function, p_send_tab_id);
    };
    v_button_ok.onclick = v_modal_password_ok_function;
    v_button_cancel.onclick = function() {
      v_modal_password_ok_clicked = false;
      if (p_cancel_callback_function) p_cancel_callback_function();
    };
  }
  function checkPasswordPrompt(p_database_index, p_callback_function, p_cancel_callback_function, p_send_tab_id) {
    var v_password = document.getElementById("txt_password_prompt").value;
    var v_tab_id = "";
    if (p_send_tab_id) v_tab_id = v_connTabControl.selectedTab.id;
    v_modal_password_ok_after_hide_function = function() {
      execAjax(
        "/renew_password/",
        JSON.stringify({ p_database_index, p_tab_id: v_tab_id, p_password: v_password }),
        function(p_return) {
          if (p_callback_function) p_callback_function();
        },
        function(p_return) {
          showPasswordPrompt$1(
            p_database_index,
            p_callback_function,
            p_cancel_callback_function,
            p_return.v_data,
            p_send_tab_id
          );
        },
        "box"
      );
    };
  }
  const passwords = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    checkPasswordPrompt,
    showPasswordPrompt: showPasswordPrompt$1
  }, Symbol.toStringTag, { value: "Module" }));
  function getProperties$1(p_view, p_data) {
    var v_tab_tag = v_connTabControl.selectedTab.tag;
    $(v_tab_tag.divLoading).fadeIn(100);
    execAjax(
      p_view,
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_data
      }),
      function(p_return) {
        v_tab_tag.gridProperties.loadData(p_return.v_data.properties);
        v_tab_tag.ddlEditor.setValue(p_return.v_data.ddl);
        v_tab_tag.ddlEditor.clearSelection();
        v_tab_tag.ddlEditor.gotoLine(0, 0, true);
        $(v_tab_tag.divLoading).fadeOut(100);
        v_tab_tag.gridPropertiesCleared = false;
      },
      function(p_return) {
        $(v_tab_tag.divLoading).fadeOut(100);
        if (p_return.v_data.password_timeout) {
          showPasswordPrompt(
            v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
            function() {
              getProperties$1(p_view, p_data);
            },
            null,
            p_return.v_data.message
          );
        } else {
          showError(p_return.v_data);
        }
      },
      "box",
      false
    );
  }
  function clearProperties$1() {
    var v_tab_tag = v_connTabControl.selectedTab.tag;
    if (!v_tab_tag.gridPropertiesCleared) {
      v_tab_tag.gridProperties.loadData([]);
      v_tab_tag.gridPropertiesCleared = true;
      v_tab_tag.ddlEditor.setValue("");
      v_tab_tag.ddlEditor.clearSelection();
      v_tab_tag.ddlEditor.gotoLine(0, 0, true);
    }
  }
  const properties = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    clearProperties: clearProperties$1,
    getProperties: getProperties$1
  }, Symbol.toStringTag, { value: "Module" }));
  function composedPath(el) {
    var path = [];
    while (el) {
      path.push(el);
      if (el.tagName === "HTML") {
        path.push(document);
        path.push(window);
        return path;
      }
      el = el.parentElement;
    }
  }
  function createTabControl$1({ p_div, p_hierarchy, p_layout }) {
    var v_div = document.getElementById(p_div);
    v_div.innerHTML = "";
    var v_nav = document.createElement("nav");
    var v_div_tab_list = document.createElement("div");
    v_div_tab_list.className = "nav nav-tabs";
    v_nav.appendChild(v_div_tab_list);
    var v_div_tab_content_list = document.createElement("div");
    v_div_tab_content_list.className = "tab-content omnidb__tab-content";
    var v_tab_menu = document.createElement("div");
    v_tab_menu.className = "omnidb__tab-menu";
    var css_tab_menu_variations = ["omnidb__tab-menu--", "omnidb__theme-bg--menu-"];
    v_div.classList.add(css_tab_menu_variations[0] + "container");
    if (p_hierarchy !== void 0) {
      v_div.classList.add(css_tab_menu_variations[0] + "container--" + p_hierarchy);
      v_div.classList.add(css_tab_menu_variations[0] + "container--menu-shown");
      for (let i2 = 0; i2 < css_tab_menu_variations.length; i2++) {
        v_tab_menu.classList.add(css_tab_menu_variations[i2] + p_hierarchy);
      }
      v_div_tab_content_list.classList.add("omnidb__tab-content--" + p_hierarchy);
    }
    v_tab_menu.appendChild(v_nav);
    v_div.appendChild(v_tab_menu);
    v_div.appendChild(v_div_tab_content_list);
    if (p_layout === "card") {
      v_div.classList.add("card");
      v_tab_menu.classList.add("card-header");
      v_tab_menu.classList.add("pb-0");
      v_div_tab_content_list.classList.add("card-body");
    }
    var v_tabControl = {
      // Params
      id: p_div,
      selectedTab: null,
      selectedDiv: null,
      selectedA: null,
      tabColor: null,
      tabCounter: 0,
      tabListContentDiv: v_div_tab_content_list,
      tabList: [],
      tabListDiv: v_div_tab_list,
      tabMenu: v_tab_menu,
      tabCssVariation: css_tab_menu_variations[0],
      tag: new Object(),
      isToggleable: p_hierarchy === "primary",
      // Actions
      disableTabIndex: function(p_index) {
        this.tabList[p_index].elementA.classList.add("disabled");
      },
      enableTabIndex: function(p_index) {
        this.tabList[p_index].elementA.classList.remove("disabled");
      },
      disableSelectableTabIndex: function(p_index) {
        this.tabList[p_index].selectable = false;
      },
      enableSelectableTabIndex: function(p_index) {
        this.tabList[p_index].selectable = true;
      },
      selectTab: function(p_tab) {
        if (this.selectedTab != p_tab) {
          if (p_tab.selectable) {
            if (this.selectedTab != null) this.selectedTab.selected = false;
            p_tab.selected = true;
            this.selectedTab = p_tab;
            if (this.selectedDiv != null) {
              this.selectedDiv.classList.remove("active");
              this.selectedA.classList.remove("active");
            }
            p_tab.elementA.classList.add("active");
            p_tab.elementDiv.classList.add("active");
            this.selectedA = p_tab.elementA;
            this.selectedDiv = p_tab.elementDiv;
            if (p_tab.selectFunction != null) {
              p_tab.selectFunction();
            }
          }
        }
      },
      selectTabIndex: function(p_index) {
        if (this.tabList[p_index].selectable) {
          if (this.selectedTab != null) this.selectedTab.selected = false;
          this.tabList[p_index].selected = true;
          this.selectedTab = this.tabList[p_index];
          if (this.selectedDiv != null) {
            this.selectedDiv.classList.remove("active");
            this.selectedA.classList.remove("active");
          }
          this.tabList[p_index].elementA.classList.add("active");
          this.tabList[p_index].elementDiv.classList.add("active");
          this.selectedA = this.tabList[p_index].elementA;
          this.selectedDiv = this.tabList[p_index].elementDiv;
          if (this.tabList[p_index].selectFunction != null) {
            this.tabList[p_index].selectFunction();
          }
        }
      },
      disableTab: function(p_tab) {
        p_tab.elementA.classList.add("disabled");
      },
      enableTab: function(p_tab) {
        p_tab.elementA.classList.remove("disabled");
      },
      disableSelectableTab: function(p_tab) {
        p_tab.selectable = false;
      },
      enableSelectableTab: function(p_tab) {
        p_tab.selectable = true;
      },
      disableClose: function(p_tab) {
        if (p_tab.elementClose != null) {
          p_tab.elementClose.style.display = "none";
        }
      },
      enableClose: function(p_tab) {
        if (p_tab.elementClose != null) {
          p_tab.elementClose.style.display = "";
        }
      },
      removeTabIndex: function(p_index) {
        var v_tab = this.tabList[p_index];
        if (v_tab.closeFunction != null) {
          v_tab.closeFunction(null, v_tab);
        } else if (v_tab) {
          this.removeTab(v_tab);
        }
      },
      removeLastTab: function() {
        var v_this = this;
        var v_tab_index = v_this.tabList.length - 1;
        this.removeTabIndex(v_tab_index);
      },
      removeTab: function(p_tab) {
        var v_tab = p_tab;
        v_tab.elementDiv.parentNode.removeChild(v_tab.elementDiv);
        v_tab.elementA.parentNode.removeChild(v_tab.elementA);
        var v_index = this.tabList.indexOf(p_tab);
        var v_current_index = this.tabList.indexOf(this.selectedTab);
        if (v_index == v_current_index) {
          if (v_index > 0) this.selectTabIndex(v_index - 1);
          else if (this.tabList[v_index + 1] != null) this.selectTabIndex(v_index + 1);
        }
        this.tabList.splice(this.tabList.indexOf(p_tab), 1);
        if (this === v_connTabControl && // Checking if the removed tab belongs to the outer menu.
        v_connTabControl.tabList.indexOf(v_connTabControl.selectedTab) === -1) {
          var v_welcome_tab_index = false;
          for (let i2 = 0; i2 < v_connTabControl.tabList.length; i2++) {
            if (v_connTabControl.tabList[i2].tag) {
              if (v_connTabControl.tabList[i2].tag.mode === "welcome") {
                v_welcome_tab_index = i2;
              }
            }
          }
          if (v_welcome_tab_index) {
            this.selectTabIndex(v_welcome_tab_index);
          }
        }
      },
      renameTab: function(p_tab, p_name) {
        var v_tab_title_span = $(p_tab.elementA).find(".omnidb__tab-menu__link-name");
        if (v_tab_title_span) {
          v_tab_title_span.html(p_name);
        }
        p_tab.text = p_name;
      },
      dragEndFunction: function(e, p_tab) {
        let el = e.target;
        el.getBoundingClientRect();
        let el_index = $(el).index();
        let drop_pos_x = e.x;
        let drop_pos_y = e.y;
        let old_index = el_index;
        let new_index;
        let siblings = $(el).siblings();
        let total = siblings.length;
        for (let i2 = 0; i2 < total; i2++) {
          let sibling = siblings[i2];
          let sibling_pos = sibling.getBoundingClientRect();
          let sibling_pos_x = sibling_pos.x;
          let sibling_pos_x_center = sibling_pos_x + sibling_pos.width / 2;
          let sibling_pos_x_end = sibling_pos_x + sibling_pos.width;
          let sibling_pos_y = sibling_pos.y;
          let sibling_pos_y_end = sibling_pos.y + sibling_pos.height;
          if (sibling_pos_y < drop_pos_y && drop_pos_y < sibling_pos_y_end && sibling_pos_x < drop_pos_x && drop_pos_x < sibling_pos_x_end) {
            var removedEl = p_tab.tabList.splice(old_index, 1)[0];
            if (drop_pos_x < sibling_pos_x_center) {
              new_index = i2;
              p_tab.tabList.splice(new_index, 0, removedEl);
              sibling.before(el);
            } else {
              new_index = i2 + 1;
              p_tab.tabList.splice(new_index, 0, removedEl);
              sibling.after(el);
            }
          }
        }
      },
      hideTabMenu: function() {
        document.getElementById(p_div).classList.remove(this.tabCssVariation + "container--menu-shown");
        this.tabMenu.classList.remove(this.tabCssVariation + "shown");
      },
      showTabMenu: function() {
        document.getElementById(p_div).classList.add(this.tabCssVariation + "container--menu-shown");
        this.tabMenu.classList.add(this.tabCssVariation + "shown");
      },
      toggleTabMenu: function(e) {
        var v_this = this;
        $("#" + p_div).toggleClass(this.tabCssVariation + "container--menu-shown");
        $(v_this.tabMenu).toggleClass(v_this.tabCssVariation + "shown");
      },
      /**
       * ## createTab
       * @desc Creates a generic tab object with optional parameters and callbacks.
       * Ex: p_mode === 'customer_dashboard' expects data based on columns from customer tables, and will return all data necessary to kickoff a customer dashboard.
       *
       * @param  {function} p_clickFunction Callback for onclick.
       * @param  {boolean} p_close Defines if the elementA has a closing icon.
       * @param  {function} p_dblClickFunction  Callback for ondoubleclick.
       * @param  {boolean} p_disabled  Defines if the elementA is disabled.
       * @param  {string} p_icon HTML string is accepted as an optional icon.
       * @param  {boolean} p_isDraggable Defines if the elementA is draggable inside the tab-menu.
       * @param  {string} p_name HTML string is accepted as an optional name for the elementA.
       * @param  {function} p_rightClickFunction Callback for oncontextmenu.
       * @param  {function} p_selectFunction  Callback for after the tab-content is rendered.
       * @param  {boolean} p_selectable  Defines if the the tab-content is controlled by default bootstrap tab system selection. Used together with p_clickFunction to override the selecting tab behaviour, like the snippets panel.
       * @param  {string} p_tooltip_name  HTML string is accepted as an optional tooltip. This is bootstrap's default tooltip.
       * @param  {string} p_omnidb_tooltip_name  HTML string is accepted as an optional tooltip. This is OmniDB custom tooltip, used in the outer menu to avoid overflow bugs from bootstrap.
       * @return {oject} Creates the tab object in this tabControl.
       */
      createTab: function({
        p_clickFunction = null,
        p_close = true,
        p_closeFunction = null,
        p_dblClickFunction = null,
        p_disabled = false,
        p_icon = false,
        p_isDraggable = true,
        p_name = "",
        p_rightClickFunction = false,
        p_selectFunction = null,
        p_selectable = true,
        p_tooltip_name = false,
        p_omnidb_tooltip_name = false
      }) {
        var v_control = this;
        var v_index = this.tabCounter;
        this.tabCounter++;
        var v_tab = {
          id: p_div + "_tab" + v_index + "_" + Date.now(),
          seq: v_index,
          text: p_name,
          selected: false,
          elementA: null,
          elementDiv: null,
          elementClose: null,
          tag: null,
          clickFunction: p_clickFunction,
          dblClickFunction: p_dblClickFunction,
          closeFunction: p_closeFunction,
          selectFunction: p_selectFunction,
          selectable: p_selectable,
          disabled: p_disabled,
          removeTab: function() {
            v_control.removeTab(this);
          },
          renameTab: function(p_name2) {
            v_control.renameTab(this, p_name2);
          },
          disableClose: function() {
            v_control.disableClose(this);
          },
          enableClose: function() {
            v_control.enableClose(this);
          },
          dragEndFunction: function(e, p_tab, p_index) {
            v_control.dragEndFunction(e, p_tab);
          },
          isDraggable: p_isDraggable
        };
        var v_a = document.createElement("a");
        v_a.setAttribute("id", "a_" + v_tab.id);
        v_a.setAttribute("data-toggle", "tab");
        v_a.setAttribute("role", "tab");
        v_a.setAttribute("aria-selected", "false");
        v_a.setAttribute("aria-selected", "false");
        v_a.setAttribute("href", "#div_" + v_tab.id);
        v_a.setAttribute("aria-controls", "div_" + v_tab.id);
        if (v_tab.isDraggable) {
          v_a.setAttribute("draggable", "true");
          v_a.ondragend = function(e) {
            e.stopPropagation();
            e.preventDefault();
            v_tab.dragEndFunction(e, this);
          }.bind(this);
        }
        if (p_disabled) {
          v_a.className = "omnidb__tab-menu__link nav-item nav-link disabled";
        } else {
          v_a.className = "omnidb__tab-menu__link nav-item nav-link";
        }
        var v_close = document.createElement("i");
        v_close.className = "fas fa-times tab-icon icon-close omnidb__tab-menu__link-close";
        v_tab.elementClose = v_close;
        v_close.onclick = function(e) {
          e.stopPropagation();
          e.preventDefault();
          if (v_tab.closeFunction != null) {
            v_tab.closeFunction(e, v_tab);
          }
        };
        if (p_rightClickFunction) {
          v_a.oncontextmenu = function(e) {
            e.stopPropagation();
            e.preventDefault();
            p_rightClickFunction(e);
          };
        }
        var v_icon = p_icon !== false ? '<span class="omnidb__menu__btn omnidb__tab-menu__link-icon">' + p_icon + "</span>" : "";
        var v_name = p_name !== void 0 && p_name !== null && p_name !== "" ? p_name : "";
        if (p_tooltip_name) {
          getAttributesTooltip(v_a, p_tooltip_name, null, "right");
        } else if (p_omnidb_tooltip_name) {
          getAttributesOmniDBTooltip(v_a, p_omnidb_tooltip_name, null, "right");
        }
        v_a.innerHTML = '<span class="omnidb__tab-menu__link-content">' + v_icon + '<span class="omnidb__tab-menu__link-name">' + v_name + "<span><span>";
        if (p_close) {
          v_a.appendChild(v_close);
        }
        v_a.ondblclick = function(e) {
          if (v_tab.dblClickFunction != null) v_tab.dblClickFunction(v_tab);
        };
        var v_div2 = document.createElement("div");
        v_div2.className = "tab-pane";
        v_div2.setAttribute("id", "div_" + v_tab.id);
        v_div2.setAttribute("role", "tabpanel");
        v_div2.setAttribute("aria-labelledby", "a_" + v_tab.id);
        v_tab.elementA = v_a;
        v_tab.elementDiv = v_div2;
        v_a.onclick = function(e) {
          e.stopPropagation();
          e.preventDefault();
          if (v_tab.selectable) {
            v_control.selectTab(v_tab);
          }
          if (v_tab.clickFunction != null) {
            v_tab.clickFunction(e);
          }
          if (p_tooltip_name) {
            $(v_a).tooltip("hide");
          }
        };
        this.tabListDiv.appendChild(v_a);
        this.tabListContentDiv.appendChild(v_div2);
        this.tabList.push(v_tab);
        return v_tab;
      }
    };
    return v_tabControl;
  }
  function createSimpleElement$1(p_type, p_id, p_class) {
    element = document.createElement(p_type);
    if (p_id != void 0) element.id = p_id;
    if (p_class != void 0) element.className = p_class;
    return element;
  }
  function createImgElement$1(p_id, p_class, p_src) {
    element = document.createElement("img");
    if (p_id != void 0) element.id = p_id;
    if (p_class != void 0) element.className = p_class;
    if (p_src != void 0) element.src = p_src;
    return element;
  }
  const tabs = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    composedPath,
    createImgElement: createImgElement$1,
    createSimpleElement: createSimpleElement$1,
    createTabControl: createTabControl$1
  }, Symbol.toStringTag, { value: "Module" }));
  var v_createConnTabFunction = function(p_index, p_create_query_tab = true, p_name = false, p_tooltip_name = false) {
    if (v_connTabControl.tag.connections.length == 0) {
      v_connTabControl.selectTabIndex(v_connTabControl.tabList.length - 2);
      showAlert("Create connections first.");
    } else {
      let v_conn = v_connTabControl.tag.connections[0];
      for (let i2 = 0; i2 < v_connTabControl.tag.connections.length; i2++) {
        if (v_connTabControl.tag.connections[i2].v_conn_id === p_index) {
          v_conn = v_connTabControl.tag.connections[i2];
        }
      }
      var v_conn_name = "";
      if (p_name) {
        v_conn_name = p_name;
      }
      if (v_conn_name === "" && v_conn.v_alias && v_conn.v_alias !== "") {
        v_conn_name = escapeHtml(v_conn.v_alias);
      }
      if (!p_tooltip_name) {
        p_tooltip_name = "";
        if (v_conn.v_conn_string && v_conn.v_conn_string !== "") {
          if (v_conn.v_alias) {
            p_tooltip_name += '<h5 class="my-1">' + escapeHtml(v_conn.v_alias) + "</h5>";
          }
          p_tooltip_name += '<div class="mb-1">' + escapeHtml(v_conn.v_conn_string) + "</div>";
        } else {
          if (v_conn.v_alias) {
            p_tooltip_name += '<h5 class="my-1">' + escapeHtml(v_conn.v_alias) + "</h5>";
          }
          if (v_conn.v_details1) {
            p_tooltip_name += '<div class="mb-1">' + escapeHtml(v_conn.v_details1) + "</div>";
          }
          if (v_conn.v_details2) {
            p_tooltip_name += '<div class="mb-1">' + escapeHtml(v_conn.v_details2) + "</div>";
          }
        }
      }
      let v_icon = '<img src="' + v_url_folder + "/static/OmniDB_app/images/" + v_conn.v_db_type;
      if (v_conn.v_db_type === "postgresql" || v_conn.v_db_type === "oracle" || v_conn.v_db_type === "mariadb" || v_conn.v_db_type === "mysql") {
        v_icon += '.svg"/>';
      } else {
        v_icon += '_medium.png"/>';
      }
      var v_tab = v_connTabControl.createTab({
        p_icon: v_icon,
        p_name: v_conn_name,
        p_selectFunction: function() {
          document.title = "OmniDB";
          if (this.tag != null) {
            checkTabStatus(this);
            refreshHeights(true);
          }
          if (this.tag != null && this.tag.tabControl != null && this.tag.tabControl.selectedTab.tag.editor != null) {
            this.tag.tabControl.selectedTab.tag.editor.focus();
          }
          $('[data-bs-toggle="tooltip"]').tooltip({ animation: true, html: true });
        },
        p_close: false,
        // Replacing default close icon with contextMenu.
        p_closeFunction: function(e, p_tab) {
          var v_this_tab = p_tab;
          beforeCloseTab(e, function() {
            var v_tabs_to_remove = [];
            var v_message_data = { tab_id: p_tab.tag.tab_id, tab_db_id: null };
            v_tabs_to_remove.push(v_message_data);
            for (var i2 = 0; i2 < p_tab.tag.tabControl.tabList.length; i2++) {
              var v_tab2 = p_tab.tag.tabControl.tabList[i2];
              if (v_tab2.tag != null) {
                if (v_tab2.tag.mode == "query" || v_tab2.tag.mode == "edit" || v_tab2.tag.mode == "console") {
                  var v_message_data = { tab_id: v_tab2.tag.tab_id, tab_db_id: null };
                  if (v_tab2.tag.mode == "query") v_message_data.tab_db_id = v_tab2.tag.tab_db_id;
                  v_tabs_to_remove.push(v_message_data);
                } else if (v_tab2.tag.mode == "monitor_dashboard") {
                  v_tab2.tag.tab_active = false;
                  cancelMonitorUnits(v_tab2.tag);
                }
              }
              if (v_tab2.tag.tabCloseFunction) v_tab2.tag.tabCloseFunction(v_tab2.tag);
            }
            if (v_tabs_to_remove.length > 0) {
              createRequest(v_queryRequestCodes.CloseTab, v_tabs_to_remove);
            }
            v_this_tab.removeTab();
          });
        },
        p_rightClickFunction: function(e) {
          var v_option_list = [
            {
              text: '<p class="mb-0 text-danger">Close Connection Tab</p>',
              // icon: 'fas cm-all fa-terminal text-danger',
              action: function() {
                if (v_tab.closeFunction != null) {
                  v_tab.closeFunction(e, v_tab);
                }
              }
            }
          ];
          customMenu(
            {
              x: e.clientX + 5,
              y: e.clientY + 5
            },
            v_option_list,
            null
          );
        },
        p_omnidb_tooltip_name: p_tooltip_name
      });
      v_connTabControl.selectTab(v_tab);
      var v_html = `<div style="position: relative; height: 100%;"><div style="display: grid; grid-template-areas: 'left splitter right'; grid-template-columns: auto 12px minmax(0, 1fr); height: 100%;"><div id="` + v_tab.id + '_div_left" class="omnidb__workspace__div-left col" style="grid-area: left; max-width: 300px; width: 300px;"><div class="omnidb__workspace__content-left"><div id="' + v_tab.id + '_details" class="omnidb__workspace__connection-details"></div><div id="' + v_tab.id + '_tree" style="overflow-y: auto; flex-grow: 1; min-height: 0; transition: scroll 0.3s;"></div><div id="' + v_tab.id + '_left_resize_line_horizontal" onmousedown="resizeTreeVertical(event)" style="width: 100%; height: 12px; cursor: ns-resize; border-top: 1px dashed #acc4e8; opacity: 0.6;"></div><div id="tree_tabs_parent_' + v_tab.id + '" class="omnidb__tree-tabs" style="position: relative; flex-shrink: 0; flex-basis: 280px;"><div id="' + v_tab.id + `_loading" class="div_loading" style="z-index: 1000;"><div class="div_loading_cover"></div><div class="div_loading_content">  <div class="spinner-border text-primary" style="width: 4rem; height: 4rem;" role="status">    <span class="sr-only ">Loading...</span>  </div></div></div><button type="button" onclick="toggleTreeTabsContainer('tree_tabs_parent_` + v_tab.id + "','" + v_tab.id + `_left_resize_line_horizontal')" class="btn omnidb__theme__btn--secondary omnidb__tree-tabs__toggler"><i class="fas fa-arrows-alt-v"></i></button><div id="tree_tabs_` + v_tab.id + '" class="omnidb__tree-tabs__container" style="position: relative;"></div></div></div></div><div class="resize_line_vertical omnidb__resize-line__container" onmousedown="resizeConnectionHorizontal(event)" style="grid-area: splitter; height: 100%; width: 12px; cursor: ew-resize; border-right: 1px dashed #acc4e8; opacity: 0.6; z-index: 10;"></div><div id="' + v_tab.id + '_div_right" class="omnidb__workspace__div-right col" style="grid-area: right; position: relative;"><button type="button" class="py-4 px-0 btn omnidb__theme__btn--secondary omnidb__tree__toggler" onclick="toggleTreeContainer()"><i class="fas fa-arrows-alt-h"></i></button><div id="' + v_tab.id + '_tabs" class="w-100"></div></div></div></div>';
      var v_tab_title_span = $(v_tab.elementA).find(".omnidb__tab-menu__link-name");
      if (v_tab_title_span) {
        v_tab_title_span.attr("id", "tab_title_" + v_tab.id);
      }
      v_tab.elementDiv.innerHTML = v_html;
      var v_treeTabs = createTabControl({ p_div: "tree_tabs_" + v_tab.id });
      var v_selectPropertiesTabFunc = function() {
        v_treeTabs.selectTabIndex(0);
        v_connTabControl.selectedTab.tag.currTreeTab = "properties";
        refreshTreeHeight();
      };
      var v_selectDDLTabFunc = function() {
        v_treeTabs.selectTabIndex(1);
        v_connTabControl.selectedTab.tag.currTreeTab = "ddl";
        refreshTreeHeight();
      };
      var v_properties_tab = v_treeTabs.createTab({
        p_name: "Properties",
        p_close: false,
        p_clickFunction: function(e) {
          v_selectPropertiesTabFunc();
        }
      });
      var v_ddl_tab = v_treeTabs.createTab({
        p_name: "DDL",
        p_close: false,
        p_clickFunction: function(e) {
          v_selectDDLTabFunc();
        }
      });
      v_treeTabs.selectTabIndex(0);
      var v_currTabControl = createTabControl({
        p_div: v_tab.id + "_tabs",
        p_hierarchy: "secondary"
      });
      v_currTabControl.createTab({
        p_name: "+",
        p_close: false,
        p_selectable: false,
        p_clickFunction: function(e) {
          showMenuNewTab(e);
        }
      });
      var v_ddl_div = v_ddl_tab.elementDiv;
      ace.require("ace/ext/language_tools");
      var v_editor = ace.edit(v_ddl_tab.elementDiv);
      v_editor.$blockScrolling = Infinity;
      v_editor.setTheme("ace/theme/" + v_editor_theme);
      v_editor.session.setMode("ace/mode/sql");
      v_editor.setFontSize(Number(v_font_size));
      v_editor.session.setTabSize(v_indent_size || 4);
      v_editor.session.setUseSoftTabs(v_indent_char !== "tab");
      v_editor.commands.bindKey("ctrl-space", null);
      v_editor.commands.bindKey("Cmd-,", null);
      v_editor.commands.bindKey("Ctrl-,", null);
      v_editor.commands.bindKey("Cmd-Delete", null);
      v_editor.commands.bindKey("Ctrl-Delete", null);
      v_editor.commands.bindKey("Ctrl-Up", null);
      v_editor.commands.bindKey("Ctrl-Down", null);
      v_editor.setReadOnly(true);
      v_ddl_div.onclick = function() {
        v_editor.focus();
      };
      v_properties_tab.elementDiv.innerHTML = "<div class='p-2 omnidb__theme-border--primary'><div id='div_properties_result_" + v_tab.id + "' style='width: 100%; overflow: hidden;'></div></div>";
      var v_divProperties = document.getElementById("div_properties_result_" + v_tab.id);
      var v_ddlProperties = v_ddl_tab.elementDiv;
      var columnProperties = [];
      var col = new Object();
      col.title = "Property";
      col.readOnly = true;
      columnProperties.push(col);
      var col = new Object();
      col.title = "Value";
      col.readOnly = true;
      columnProperties.push(col);
      var ht = new Handsontable(v_divProperties, {
        licenseKey: "non-commercial-and-evaluation",
        data: [],
        columns: columnProperties,
        colHeaders: true,
        stretchH: "all",
        autoColumnSize: true,
        manualColumnResize: false,
        minSpareCols: 0,
        minSpareRows: 0,
        fillHandle: false,
        disableVisualSelection: true,
        contextMenu: {
          callback: function(key, options) {
            if (key === "view_data") {
              editCellData(
                this,
                options[0].start.row,
                options[0].start.col,
                this.getDataAtCell(options[0].start.row, options[0].start.col),
                false
              );
            } else if (key === "copy") {
              this.selectCell(options[0].start.row, options[0].start.col, options[0].end.row, options[0].end.col);
              document.execCommand("copy");
            }
          },
          items: {
            copy: {
              name: '<div style="position: absolute;"><i class="fas fa-copy cm-all" style="vertical-align: middle;"></i></div><div style="padding-left: 30px;">Copy</div>'
            },
            view_data: {
              name: '<div style="position: absolute;"><i class="fas fa-edit cm-all" style="vertical-align: middle;"></i></div><div style="padding-left: 30px;">View Content</div>'
            }
          }
        },
        cells: function(row, col2, prop) {
          var cellProperties = {};
          cellProperties.renderer = whiteHtmlRenderer;
          return cellProperties;
        }
      });
      var v_tag = {
        tab_id: v_tab.id,
        tabControl: v_currTabControl,
        tabTitle: v_tab_title_span,
        divDetails: document.getElementById(v_tab.id + "_details"),
        divTree: document.getElementById(v_tab.id + "_tree"),
        divTreeTabs: document.getElementById("tree_tabs_parent_" + v_tab.id),
        divProperties: v_divProperties,
        gridProperties: ht,
        gridPropertiesCleared: true,
        divDDL: v_ddlProperties,
        divLoading: document.getElementById(v_tab.id + "_loading"),
        divLeft: document.getElementById(v_tab.id + "_div_left"),
        divRight: document.getElementById(v_tab.id + "_div_right"),
        selectedDatabaseIndex: 0,
        connTabControl: v_connTabControl,
        mode: "connection",
        firstTimeOpen: true,
        TreeTabControl: v_treeTabs,
        treeTabsVisible: true,
        currTreeTab: null,
        ddlEditor: v_editor,
        consoleHistoryFecthed: false,
        consoleHistoryList: null
      };
      v_tab.tag = v_tag;
      v_tag.selectPropertiesTabFunc = v_selectPropertiesTabFunc;
      v_tag.selectDDLTabFunc = v_selectDDLTabFunc;
      var v_index = v_connTabControl.tag.connections[0].v_conn_id;
      if (p_index) {
        v_index = p_index;
      }
      changeDatabase(v_index);
      if (p_create_query_tab) {
        v_connTabControl.tag.createConsoleTab();
        v_connTabControl.tag.createQueryTab();
      }
      $('[data-bs-toggle="tooltip"]').tooltip({ animation: true, html: true });
      setTimeout(function() {
        v_selectPropertiesTabFunc();
      }, 10);
    }
    endLoading();
  };
  function refreshOuterConnectionHeights() {
    var v_tab_tag = v_connTabControl.selectedTab.tag;
    if (v_tab_tag.divLeft) {
      var v_div_left = v_tab_tag.divLeft;
      var v_div_right = v_tab_tag.divRight;
      var v_totalHeight = window.innerHeight - $(v_div_left).offset().top;
      v_div_left.style["height"] = v_totalHeight + "px";
      $(v_div_left).hasClass("omnidb__workspace__div-left--shrink");
      var v_totalWidth = v_connTabControl.selectedDiv.getBoundingClientRect().width;
      var v_div_left_width_value = v_div_left.getBoundingClientRect().width;
      var v_right_width_value = v_totalWidth - v_div_left_width_value - 12;
      v_div_right.style["max-width"] = v_right_width_value + "px";
      v_div_right.style["width"] = v_right_width_value + "px";
    }
  }
  const outerConnectionTab = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    refreshOuterConnectionHeights,
    v_createConnTabFunction
  }, Symbol.toStringTag, { value: "Module" }));
  var v_createOuterTerminalTabFunction = function(p_conn_id = -1, p_alias = "Terminal", p_details = false) {
    let v_tooltip_name = "";
    if (p_alias) {
      v_tooltip_name += '<h5 class="my-1">' + escapeHtml(p_alias) + "</h5>";
    }
    if (p_details) {
      v_tooltip_name += '<div class="mb-1">' + escapeHtml(p_details) + "</div>";
    }
    var v_tab = v_connTabControl.createTab({
      p_icon: '<i class="fas fa-terminal"></i>',
      p_name: escapeHtml(p_alias),
      p_selectFunction: function() {
        if (this.tag != null) {
          refreshHeights();
        }
        if (this.tag != null && this.tag.editor_console != null) {
          this.tag.editor_console.focus();
        }
      },
      p_close: false,
      // Replacing default close icon with contextMenu.
      p_closeFunction: function(e, p_tab) {
        var v_this_tab = p_tab;
        v_this_tab.removeTab();
      },
      p_rightClickFunction: function(e) {
        terminalContextMenu(e, v_tab);
      },
      p_omnidb_tooltip_name: v_tooltip_name
    });
    v_connTabControl.selectTab(v_tab);
    var v_html = '<div class="container-fluid mt-2"><div class="row"><div class="col"><div class="omnidb__txt-console p-2"><div id="txt_console_' + v_tab.id + '" style="width: 100%; height: 120px;"></div></div></div></div></div>';
    var v_div = document.getElementById("div_" + v_tab.id);
    v_div.innerHTML = v_html;
    var term_div = document.getElementById("txt_console_" + v_tab.id);
    var term = new Terminal({
      fontSize: v_font_size,
      theme: v_current_terminal_theme,
      fontFamily: "Monospace"
    });
    term.open(term_div);
    term.on("data", (key, ev) => {
      terminalKey(key);
    });
    Terminal.applyAddon(fit);
    var v_tag = {
      tab_id: v_tab.id,
      mode: "outer_terminal",
      editor_console: term,
      editorDivId: "txt_console_" + v_tab.id,
      div_console: document.getElementById("txt_console_" + v_tab.id),
      context: null,
      tabControl: v_connTabControl,
      connTab: v_connTabControl.selectedTab,
      currDatabaseIndex: null,
      state: 0,
      terminalHistoryList: [],
      tempData: [],
      connId: p_conn_id
    };
    v_tab.tag = v_tag;
    $('[data-bs-toggle="tooltip"]').tooltip({ animation: true, html: true });
    setTimeout(function() {
      refreshHeights();
      startTerminal(p_conn_id);
    }, 10);
  };
  const outerTerminalTab = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    v_createOuterTerminalTabFunction
  }, Symbol.toStringTag, { value: "Module" }));
  var v_createWelcomeTabFunction = function(p_index, p_create_query_tab = true, p_name = false, p_tooltip_name = false) {
    var v_tab = v_connTabControl.createTab({
      p_icon: '<i class="fas fa-hand-spock"></i>',
      p_name: "Welcome",
      p_selectFunction: function() {
        document.title = "Welcome to OmniDB";
        $('[data-bs-toggle="tooltip"]').tooltip({ animation: true, html: true });
      },
      p_close: false,
      // Replacing default close icon with contextMenu.
      p_closeFunction: function(e, p_tab) {
        var v_this_tab = p_tab;
        beforeCloseTab(e, function() {
          v_this_tab.removeTab();
        });
      },
      p_rightClickFunction: function(e) {
        var v_option_list = [
          {
            text: '<p class="mb-0 text-danger">Close Welcome Tab</p>',
            action: function() {
              if (v_tab.closeFunction != null) {
                v_tab.closeFunction(e, v_tab);
              }
            }
          }
        ];
        customMenu(
          {
            x: e.clientX + 5,
            y: e.clientY + 5
          },
          v_option_list,
          null
        );
      },
      p_omnidb_tooltip_name: '<h5 class="my-1">Welcome to OmniDB</h5>'
    });
    v_connTabControl.selectTab(v_tab);
    var v_animated_omnis = `<svg
			version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
			x="0px" y="0px"
			width="82.333px" height="82.333px"
			viewBox="0 0 82.333 82.333" enable-background="new 0 0 82.333 82.333"
			xml:space="preserve"
	>
			<g class="animated-omnis__icon-grid animated-omnis__group--to-blue">
					<path fill="#878FC6" d="M57.694,31.129c-1.484-2.352-3.474-4.342-5.825-5.823c0.646,1.263,1.214,2.643,1.691,4.129
							C55.049,29.915,56.43,30.486,57.694,31.129z"/>
					<path fill="#878FC6" d="M43.292,22.507v5.234c2.323,0.072,4.553,0.333,6.649,0.762c-0.969-2.344-2.205-4.237-3.614-5.531
							C45.343,22.736,44.331,22.58,43.292,22.507z"/>
					<path fill="#878FC6" d="M57.692,50.87c-1.265,0.644-2.643,1.215-4.132,1.691c-0.477,1.489-1.046,2.867-1.691,4.132
							C54.221,55.211,56.21,53.221,57.692,50.87z"/>
					<path fill="#878FC6" d="M60.188,44.681c-0.359-0.742-0.612-1.537-0.744-2.381h-4.192c-0.072,2.322-0.332,4.551-0.756,6.645
							c2.344-0.969,4.238-2.207,5.532-3.618C60.08,45.11,60.145,44.9,60.188,44.681z"/>
					<path fill="#878FC6" d="M60.029,36.675c-1.293-1.414-3.187-2.652-5.534-3.624c0.424,2.097,0.684,4.325,0.756,6.647h4.192
							c0.132-0.844,0.385-1.639,0.747-2.378C60.145,37.101,60.08,36.889,60.029,36.675z"/>
					<path fill="#878FC6" d="M52.168,42.3h-8.875v8.873c2.79-0.092,5.421-0.475,7.782-1.094C51.693,47.718,52.076,45.09,52.168,42.3z"/>
					<path fill="#878FC6" d="M43.292,39.699h8.875c-0.092-2.79-0.475-5.421-1.094-7.782c-2.361-0.619-4.992-1.002-7.782-1.094V39.699z"
							/>
					<path fill="#878FC6" d="M43.292,59.493c1.039-0.072,2.05-0.229,3.036-0.466c1.409-1.296,2.645-3.187,3.614-5.531
							c-2.096,0.427-4.327,0.687-6.649,0.759V59.493z"/>
					<path fill="#878FC6" d="M29.499,48.945c-0.427-2.094-0.687-4.322-0.759-6.645H23.5c0.071,1.036,0.228,2.046,0.462,3.026
							C25.257,46.741,27.152,47.976,29.499,48.945z"/>
					<path fill="#878FC6" d="M40.695,22.507c-1.038,0.072-2.05,0.229-3.034,0.465c-1.409,1.294-2.645,3.188-3.612,5.528
							c2.096-0.426,4.324-0.687,6.646-0.759V22.507z"/>
					<path fill="#878FC6" d="M40.695,30.823c-2.789,0.092-5.419,0.475-7.779,1.094c-0.621,2.361-1.002,4.992-1.094,7.782h8.873V30.823z"
							/>
					<path fill="#878FC6" d="M32.123,25.304c-2.353,1.481-4.344,3.472-5.827,5.822c1.265-0.643,2.645-1.214,4.135-1.691
							C30.91,27.947,31.479,26.566,32.123,25.304z"/>
					<path fill="#878FC6" d="M40.695,59.493v-5.238c-2.322-0.072-4.552-0.332-6.646-0.759c0.967,2.345,2.202,4.238,3.612,5.531
							C38.646,59.263,39.657,59.42,40.695,59.493z"/>
					<path fill="#878FC6" d="M23.499,39.699h5.241c0.071-2.322,0.332-4.551,0.759-6.647c-2.348,0.969-4.243,2.21-5.538,3.624
							C23.727,37.656,23.571,38.665,23.499,39.699z"/>
					<path fill="#878FC6" d="M32.123,56.695c-0.644-1.265-1.213-2.643-1.691-4.131c-1.489-0.478-2.868-1.049-4.133-1.691
							C27.781,53.223,29.771,55.213,32.123,56.695z"/>
					<path fill="#878FC6" d="M40.695,42.3h-8.873c0.092,2.79,0.475,5.418,1.094,7.779c2.359,0.619,4.99,1.002,7.779,1.094V42.3z"/>
			</g>
			<g class="animated-omnis__icon-external animated-omnis__group--to-blue">
					<g class="animated-omnis__icon-external__rings">
							<path fill="#878FC6" d="M36.436,14.434c0.642,1.11,0.979,2.306,1.082,3.505c1.451-0.281,2.944-0.438,4.477-0.438
									c10.299,0,19.03,6.635,22.203,15.854c1.094-0.513,2.301-0.823,3.59-0.823c0.431,0,0.846,0.064,1.26,0.127
									c-3.561-11.562-14.325-19.967-27.052-19.967c-2.165,0-4.264,0.266-6.291,0.726C35.961,13.743,36.223,14.065,36.436,14.434z"/>
							<path fill="#878FC6" d="M21.771,59.104c0.646-1.115,1.519-2.007,2.513-2.695c-3.58-4.107-5.765-9.463-5.783-15.339
									c0-0.022-0.006-0.044-0.006-0.068c0-0.019,0.005-0.036,0.005-0.055c0.013-5.874,2.193-11.227,5.766-15.339
									c-0.99-0.689-1.854-1.593-2.497-2.706c-0.211-0.366-0.356-0.747-0.508-1.127c-4.685,5.052-7.572,11.795-7.572,19.227
									c0,7.436,2.889,14.179,7.576,19.228C21.415,59.851,21.561,59.468,21.771,59.104z"/>
							<path fill="#878FC6" d="M67.787,49.47c-1.289,0-2.499-0.311-3.592-0.826c-3.175,9.222-11.901,15.853-22.2,15.853
									c-1.535,0-3.031-0.159-4.483-0.438c-0.103,1.202-0.432,2.401-1.072,3.515c-0.212,0.368-0.472,0.687-0.728,1.01
									c2.023,0.46,4.121,0.725,6.283,0.725c12.728,0,23.492-8.403,27.055-19.965C68.632,49.405,68.218,49.47,67.787,49.47z"/>
					</g>
					<g class="animated-omnis__icon-external__spheres animated-omnis__group--to-darkblue">
							<path fill="#525678" d="M73.462,41.001c0-3.137-2.539-5.678-5.676-5.678s-5.683,2.541-5.683,5.678s2.546,5.674,5.683,5.674
									S73.462,44.138,73.462,41.001z"/>
							<path fill="#525678" d="M26.262,13.754c-2.718,1.566-3.647,5.033-2.079,7.753c1.566,2.715,5.042,3.645,7.757,2.079
									c2.718-1.568,3.645-5.045,2.079-7.755C32.446,13.116,28.979,12.181,26.262,13.754z"/>
							<path fill="#525678" d="M26.267,68.256c2.72,1.568,6.187,0.639,7.755-2.076c1.566-2.715,0.636-6.189-2.077-7.755
									c-2.72-1.571-6.191-0.639-7.752,2.074C22.622,63.219,23.549,66.691,26.267,68.256z"/>
					</g>
			</g>
	</svg>`;
    let v_html_title = '<h1 class="mb-4" style="padding-left: 100px; position: relative;"><span class="omnidb__welcome__loading" style="background: none;">' + v_animated_omnis + '</span><span class="omnidb__welcome__intro-text">Hi, welcome to <span style="color:#4a6cbb;">OmniDB!</span></span></h1>';
    let v_html_intro = `<div class="card p-3 omnidb__welcome__intro-card"><p class="text-center"><span class="badge badge-danger" style="vertical-align: middle;">disclaimer</span> OmniDB is a powerful tool, and with great power...<br/>Please <strong><span class="text-danger">learn how to use it on a testing environment, NOT on production</span></strong>!</p><button type="button" class="btn btn-lg omnidb__theme__btn--primary w-auto mx-auto my-4" onclick="startTutorial('getting_started');"><i class="fas fa-list mr-2"></i>Getting started</button><div class="alert-info p-2 rounded mt-4" style="display: grid; grid-template: 'icon text';"><i class="fas fa-exclamation-triangle p-4" style="grid-area: icon;"></i><div style="grid-area: text;">
				Our focus is to provide a very flexible, secure and work-effective environment for multiple DBMS.<br>
				With that in mind, you should <strong>be aware the many actions on the UI can lead to a direct interaction with the database</strong> that you are connected with.</br>
				</div></div></div>`;
    let v_html_useful_links = '<div class="alert alert-success p-3 omnidb__welcome__useful-card"><h2 class="text-center mb-4">Useful stuff</h2><ul><li class="mb-2"><a class="btn btn-success text-white" target="_blank" href="https://www.omnidb.net"><i class="fas fa-user"></i> <span>OmniDB website</span></a></li><li class="mb-2"><a class="btn btn-success text-white" target="_blank" href="https://github.com/heptau/omnidb"><i class="fab fa-github"></i> <span>Github repo</span></a></li><li><a class="btn btn-success text-white" target="_blank" href="https://www.omnidb.net"><i class="fas fa-list"></i> <span>Read the docs</span></a></li></ul></div>';
    var v_html = '<div class="container" style="position: relative;"><div class="row"><div class="col-12"><div id="' + v_tab.id + '_welcome" class="omnidb__welcome" style="height: 100vh;display: flex;align-items: center;font-size: 1.2rem;justify-content: center;"><div>' + // Title
    v_html_title + // Welcome grid
    `<div style="display: grid; grid-template: 'intro getting_started links'; grid-gap: 64px;"><div style="grid-area: intro;">` + v_html_intro + '</div><div style="grid-area: links;">' + v_html_useful_links + "</div></div></div></div></div></div>";
    v_tab.elementDiv.innerHTML = v_html;
    var v_tag = {
      tab_id: v_tab.id,
      divWelcome: document.getElementById(v_tab.id + "_welcome"),
      selectedDatabaseIndex: 0,
      connTabControl: v_connTabControl,
      mode: "welcome"
    };
    v_tab.tag = v_tag;
    $('[data-bs-toggle="tooltip"]').tooltip({ animation: true, html: true });
    endLoading();
  };
  const outerWelcomeTab = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    v_createWelcomeTabFunction
  }, Symbol.toStringTag, { value: "Module" }));
  var v_createEditDataTabFunction = function(p_table) {
    var v_name = "Query";
    if (p_table) v_name = p_table;
    v_connTabControl.selectedTab.tag.tabControl.removeLastTab();
    var v_tab = v_connTabControl.selectedTab.tag.tabControl.createTab({
      p_icon: '<i class="fas fa-table icon-tab-title"></i>',
      p_name: '<span id="tab_title">' + v_name + '</span><span id="tab_loading" style="visibility:hidden;"><i class="tab-icon node-spin"></i></span><i title="" id="tab_check" style="display: none;" class="fas fa-check-circle tab-icon icon-check"></i>',
      p_selectFunction: function() {
        if (this.tag != null) {
          this.tag.resize();
          $('[data-bs-toggle="tooltip"]').tooltip({ animation: true, html: true });
        }
        if (this.tag != null && this.tag.editor != null) {
          this.tag.editor.focus();
          checkEditDataStatus(this);
        }
      },
      p_closeFunction: function(e, p_tab) {
        var v_current_tab = p_tab;
        beforeCloseTab(e, function() {
          removeTab(v_current_tab);
        });
      },
      p_dblClickFunction: renameTab
    });
    v_connTabControl.selectedTab.tag.tabControl.selectTab(v_tab);
    var v_tab_title_span = document.getElementById("tab_title");
    v_tab_title_span.id = "tab_title_" + v_tab.id;
    var v_tab_loading_span = document.getElementById("tab_loading");
    v_tab_loading_span.id = "tab_loading_" + v_tab.id;
    var v_tab_check_span = document.getElementById("tab_check");
    v_tab_check_span.id = "tab_check_" + v_tab.id;
    var v_html = "<div class='p-2 omnidb__theme-border-top--primary'><div id='div_edit_data_select_" + v_tab.id + "' class='query_info mb-2' style='font-size: 1.15rem;'><span class='text-primary'>select</span> * <span class='text-primary'>from</span> " + p_table + " t</div></div><div id='txt_filter_data_" + v_tab.id + "' style=' width: 100%; height: 100px;border: 1px solid #c3c3c3;'></div><div class='omnidb__resize-line__container' onmousedown='resizeVertical(event)' style='width: 100%; height: 5px; cursor: ns-resize;'><div class='resize_line_horizontal' style='height: 0px; border-bottom: 1px dashed #acc4e8;'></div><div style='height:5px;'></div></div><div class='row mb-1'><div class='tab_actions omnidb__tab-actions col-12'><button id='bt_start_" + v_tab.id + "' class='btn btn-sm omnidb__theme__btn--primary omnidb__tab-actions__btn' title='Run' onclick='queryEditData();'><i class='fas fa-play'></i></button><select id='sel_filtered_data_" + v_tab.id + "' class='sel_export_file_type form-control w-auto mr-2' onchange='queryEditData()'><option selected='selected' value='10' >Query 10 rows</option><option value='100'>Query 100 rows</option><option value='1000'>Query 1000 rows</option></select><button id='bt_cancel_" + v_tab.id + "' class='btn btn-sm btn-danger omnidb__tab-actions__btn' title='Cancel' style='display: none;' onclick='cancelEditData();'>Cancel</button><div id='div_edit_data_query_info_" + v_tab.id + "' class='query_info' style='display: inline-block; margin-left: 5px; vertical-align: middle;'></div><button id='bt_saveEditData_" + v_tab.id + "' onclick='saveEditData()' class='btn btn-sm btn-success omnidb__tab-actions__btn' style='visibility: hidden;'>Save Changes</button></div></div><div class='p-2 omnidb__theme-border--primary'><div id='div_edit_data_data_" + v_tab.id + "' style='width: 100%; overflow: auto;'></div>";
    v_tab.elementDiv.innerHTML = v_html;
    var v_height = window.innerHeight - $("#div_edit_data_data_" + v_tab.id).offset().top - 20;
    document.getElementById("div_edit_data_data_" + v_tab.id).style.height = v_height + "px";
    var langTools = ace.require("ace/ext/language_tools");
    var v_editor = ace.edit("txt_filter_data_" + v_tab.id);
    v_editor.$blockScrolling = Infinity;
    v_editor.setTheme("ace/theme/" + v_editor_theme);
    v_editor.session.setMode("ace/mode/sql");
    v_editor.setFontSize(Number(v_font_size));
    v_editor.commands.bindKey("Cmd-,", null);
    v_editor.commands.bindKey("Ctrl-,", null);
    v_editor.commands.bindKey("Cmd-Delete", null);
    v_editor.commands.bindKey("Ctrl-Delete", null);
    v_editor.commands.bindKey("Ctrl-Up", null);
    v_editor.commands.bindKey("Ctrl-Down", null);
    document.getElementById("txt_filter_data_" + v_tab.id).onclick = function() {
      v_editor.focus();
    };
    var qtags = {
      getCompletions: function(editor, session, pos, prefix, callback) {
        if (v_completer_ready && prefix != "") {
          var wordlist = [];
          v_completer_ready = false;
          addLoadingCursor();
          execAjax(
            "/get_completions_table/",
            JSON.stringify({
              p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
              p_tab_id: v_connTabControl.selectedTab.id,
              p_table: v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editDataObject.table,
              p_schema: v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editDataObject.schema
            }),
            function(p_return) {
              removeLoadingCursor();
              v_completer_ready = true;
              wordlist = p_return.v_data;
              callback(null, wordlist);
            },
            function(p_return) {
              removeLoadingCursor();
              v_completer_ready = true;
              if (p_return.v_data.password_timeout) {
                showPasswordPrompt(
                  v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
                  function() {
                    v_editor.focus();
                  },
                  function() {
                    v_editor.focus();
                  },
                  p_return.v_data.message
                );
              }
            },
            "box",
            false
          );
        } else {
          callback(null, wordlist);
        }
      }
    };
    langTools.addCompleter([qtags]);
    v_editor.completers = [qtags];
    v_editor.setOptions({ enableBasicAutocompletion: true });
    var v_resizeFunction = function() {
      var v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;
      if (v_tab_tag.editDataObject) {
        v_tab_tag.div_result.style.height = window.innerHeight - $(v_tab_tag.div_result).offset().top - 0.833 * v_font_size + "px";
        if (v_tab_tag.editDataObject.ht != null) {
          v_tab_tag.editDataObject.ht.render();
        }
      }
    };
    var v_tag = {
      tab_id: v_tab.id,
      editor: v_editor,
      editorDivId: "txt_filter_data_" + v_tab.id,
      query_info: document.getElementById("div_edit_data_query_info_" + v_tab.id),
      div_result: document.getElementById("div_edit_data_data_" + v_tab.id),
      sel_filtered_data: document.getElementById("sel_filtered_data_" + v_tab.id),
      button_save: document.getElementById("bt_saveEditData_" + v_tab.id),
      sel_export_type: document.getElementById("sel_export_type_" + v_tab.id),
      bt_cancel: document.getElementById("bt_cancel_" + v_tab.id),
      bt_save: document.getElementById("bt_save_" + v_tab.id),
      tab_title_span: v_tab_title_span,
      tab_loading_span: v_tab_loading_span,
      // tab_close_span : v_tab_close_span,
      tab_check_span: v_tab_check_span,
      state: 0,
      context: null,
      resize: v_resizeFunction,
      tabControl: v_connTabControl.selectedTab.tag.tabControl,
      connTab: v_connTabControl.selectedTab,
      // tabId: v_connTabControl.selectedTab.tag.tabControl.tabCounter,
      // tabCloseSpan: v_tab_close_span,
      mode: "edit"
    };
    v_tab.tag = v_tag;
    var v_add_tab = v_connTabControl.selectedTab.tag.tabControl.createTab({
      p_name: "+",
      p_close: false,
      p_selectable: false,
      p_clickFunction: function(e) {
        showMenuNewTab(e);
      }
    });
    v_add_tab.tag = {
      mode: "add"
    };
    setTimeout(function() {
      v_resizeFunction();
    }, 10);
  };
  const innerEditDataTab = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    v_createEditDataTabFunction
  }, Symbol.toStringTag, { value: "Module" }));
  var v_createGraphTabFunction = function(p_name) {
    var v_name = "Graph";
    if (p_name) v_name = p_name;
    v_connTabControl.selectedTab.tag.tabControl.removeLastTab();
    var v_tab = v_connTabControl.selectedTab.tag.tabControl.createTab({
      p_icon: `<i class="fab fa-hubspot icon-tab-title"></i>`,
      p_name: '<span id="tab_title">' + v_name + '</span><span id="tab_loading" style="visibility:hidden;"><i class="tab-icon node-spin"></i></span><i title="" id="tab_check" style="display: none;" class="fas fa-check-circle tab-icon icon-check"></i>',
      p_selectFunction: function() {
        document.title = "OmniDB";
        if (this.tag != null) {
          this.tag.resize();
        }
      },
      p_closeFunction: function(e, p_tab) {
        var v_current_tab = p_tab;
        beforeCloseTab(e, function() {
          if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.network) {
            v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.network.destroy();
          }
          removeTab(v_current_tab);
        });
      },
      p_dblClickFunction: renameTab
    });
    v_connTabControl.selectedTab.tag.tabControl.selectTab(v_tab);
    var v_tab_title_span = document.getElementById("tab_title");
    v_tab_title_span.id = "tab_title_" + v_tab.id;
    var v_tab_loading_span = document.getElementById("tab_loading");
    v_tab_loading_span.id = "tab_loading_" + v_tab.id;
    var v_tab_check_span = document.getElementById("tab_check");
    v_tab_check_span.id = "tab_check_" + v_tab.id;
    var v_html = "<div class='omnidb__theme-border--primary'><div id='graph_" + v_tab.id + "' style=' width: 100%; height: 200px;'></div></div>";
    v_tab.elementDiv.innerHTML = v_html;
    var v_resizeFunction = function() {
      var v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;
      if (v_tab_tag.graph_div) {
        v_tab_tag.graph_div.style.height = window.innerHeight - $(v_tab_tag.graph_div).offset().top - 0.833 * v_font_size + "px";
      }
    };
    var v_tag = {
      tab_id: v_tab.id,
      divTree: document.getElementById(v_tab.id + "_tree"),
      divLeft: document.getElementById(v_tab.id + "_div_left"),
      divRight: document.getElementById(v_tab.id + "_div_right"),
      graph_div: document.getElementById("graph_" + v_tab.id),
      tabControl: v_connTabControl.selectedTab.tag.tabControl,
      network: null,
      mode: "graph",
      resize: v_resizeFunction
    };
    v_tab.tag = v_tag;
    var v_add_tab = v_connTabControl.selectedTab.tag.tabControl.createTab({
      p_name: "+",
      p_close: false,
      p_selectable: false,
      p_clickFunction: function(e) {
        showMenuNewTab(e);
      }
    });
    v_add_tab.tag = {
      mode: "add"
    };
    setTimeout(function() {
      v_resizeFunction();
    }, 10);
  };
  const innerGraphTab = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    v_createGraphTabFunction
  }, Symbol.toStringTag, { value: "Module" }));
  var v_createSnippetTextTabFunction = function(p_snippet = null) {
    var v_name = "New Snippet";
    var v_details = {
      id: null,
      name: null,
      parent: null,
      type: "snippet"
    };
    if (p_snippet) {
      v_name = p_snippet.name;
      v_details = {
        id: p_snippet.id,
        name: p_snippet.name,
        parent: p_snippet.id_parent,
        type: "snippet"
      };
    }
    v_connTabControl.snippet_tag.tabControl.removeTabIndex(v_connTabControl.snippet_tag.tabControl.tabList.length - 1);
    var v_tab = v_connTabControl.snippet_tag.tabControl.createTab({
      p_name: '<span id="tab_title">' + v_name + '</span><span id="tab_loading" style="visibility:hidden;"><i class="tab-icon node-spin"></i></span><i title="" id="tab_check" style="display: none;" class="fas fa-check-circle tab-icon icon-check"></i>',
      p_selectFunction: function() {
        refreshHeights();
        if (this.tag != null && this.editor != null) {
          this.editor.focus();
        }
      },
      p_closeFunction: function(e, p_tab) {
        var v_current_tab = p_tab;
        beforeCloseTab(e, function() {
          removeTab(v_current_tab);
        });
      }
    });
    v_connTabControl.snippet_tag.tabControl.selectTab(v_tab);
    var v_tab_title_span = document.getElementById("tab_title");
    v_tab_title_span.id = "tab_title_" + v_tab.id;
    var v_tab_loading_span = document.getElementById("tab_loading");
    v_tab_loading_span.id = "tab_loading_" + v_tab.id;
    var v_tab_check_span = document.getElementById("tab_check");
    v_tab_check_span.id = "tab_check_" + v_tab.id;
    var v_html = '<div id="txt_snippet_' + v_tab.id + '" style="width: 100%; height: 200px; border: 1px solid #c3c3c3;"></div><div class="row mt-2"><div class="tab_actions omnidb__tab-actions col-12"><button id="bt_indent_' + v_tab.id + `" class="btn omnidb__theme__btn--secondary omnidb__tab-actions__btn" title="Indent SQL" onclick="indentSQL('snippet');"><i class="fas fa-indent mr-2"></i>indent</button><button id="bt_save_` + v_tab.id + '" class="btn omnidb__theme__btn--primary omnidb__tab-actions__btn" title="Save" style="margin-top: 5px; margin-bottom: 5px; margin-right: 5px; display: inline-block;" onclick="saveSnippetText(event);"><i class="fas fa-save mr-2"></i>save</button></div></div>';
    var v_div = document.getElementById("div_" + v_tab.id);
    v_div.innerHTML = v_html;
    var v_txt_snippet = document.getElementById("txt_snippet_" + v_tab.id);
    v_txt_snippet.style.height = window.innerHeight - $(v_txt_snippet).offset().top - 70 + "px";
    ace.require("ace/ext/language_tools");
    var v_editor = ace.edit("txt_snippet_" + v_tab.id);
    v_editor.$blockScrolling = Infinity;
    v_editor.setTheme("ace/theme/" + v_editor_theme);
    v_editor.session.setMode("ace/mode/sql");
    v_editor.setFontSize(Number(v_font_size));
    v_editor.session.setTabSize(v_indent_size || 4);
    v_editor.session.setUseSoftTabs(v_indent_char !== "tab");
    v_editor.commands.bindKey("ctrl-space", null);
    v_editor.commands.bindKey("Cmd-,", null);
    v_editor.commands.bindKey("Ctrl-,", null);
    v_editor.commands.bindKey("Cmd-Delete", null);
    v_editor.commands.bindKey("Ctrl-Delete", null);
    v_editor.commands.bindKey("Ctrl-Up", null);
    v_editor.commands.bindKey("Ctrl-Down", null);
    v_txt_snippet.onclick = function() {
      v_editor.focus();
    };
    var v_tag = {
      tab_id: v_tab.id,
      mode: "snippet",
      editor: v_editor,
      editorDiv: v_txt_snippet,
      editorDivId: "txt_snippet_" + v_tab.id,
      query_info: document.getElementById("div_query_info_" + v_tab.id),
      div_result: document.getElementById("div_result_" + v_tab.id),
      sel_export_type: document.getElementById("sel_export_type_" + v_tab.id),
      tab_title_span: v_tab_title_span,
      tab_loading_span: v_tab_loading_span,
      tab_check_span: v_tab_check_span,
      bt_start: document.getElementById("bt_start_" + v_tab.id),
      bt_save: document.getElementById("bt_save_" + v_tab.id),
      tabControl: v_connTabControl.snippet_tag.tabControl,
      snippetTab: v_connTabControl.selectedTab,
      snippetObject: v_details
    };
    v_tab.tag = v_tag;
    var v_add_tab = v_connTabControl.snippet_tag.tabControl.createTab({
      p_name: "+",
      p_close: false,
      p_selectable: false,
      p_clickFunction: function(e) {
        v_connTabControl.tag.createSnippetTextTab();
      }
    });
    v_add_tab.tag = {
      mode: "add"
    };
    v_editor.focus();
  };
  const innerSnippetTab = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    v_createSnippetTextTabFunction
  }, Symbol.toStringTag, { value: "Module" }));
  var v_createQueryTabFunction = function(p_table, p_tab_db_id) {
    v_connTabControl.selectedTab.tag.tabControl.removeLastTab();
    var v_name = "Query";
    if (p_table) {
      v_name = p_table;
    }
    let v_name_html = '<span id="tab_title">' + v_name + '</span><span id="tab_loading" style="visibility:hidden;"><i class="tab-icon node-spin"></i></span><i title="" id="tab_check" style="display: none;" class="fas fa-check-circle tab-icon icon-check"></i>';
    var v_tab = v_connTabControl.selectedTab.tag.tabControl.createTab({
      p_name: v_name_html,
      p_selectFunction: function() {
        if (this.tag != null) {
          this.tag.resize();
        }
        if (this.tag != null && this.tag.editor != null) {
          this.tag.editor.focus();
          checkQueryStatus(this);
        }
      },
      p_closeFunction: function(e, p_tab) {
        var v_current_tab = p_tab;
        beforeCloseTab(e, function() {
          removeTab(v_current_tab);
        });
      },
      p_dblClickFunction: renameTab
    });
    v_connTabControl.selectedTab.tag.tabControl.selectTab(v_tab);
    var v_tab_title_span = document.getElementById("tab_title");
    v_tab_title_span.id = "tab_title_" + v_tab.id;
    var v_tab_loading_span = document.getElementById("tab_loading");
    v_tab_loading_span.id = "tab_loading_" + v_tab.id;
    var v_tab_check_span = document.getElementById("tab_check");
    v_tab_check_span.id = "tab_check_" + v_tab.id;
    var command_history_modal = "<div class='modal fade' id='modal_command_history_" + v_tab.id + "' tabindex='-1' role='dialog' aria-hidden='true'><div class='modal-dialog modal-xl' role='document'><div class='modal-content'><div class='modal-header'><h5 class='modal-title'>Command history</h5><button type='button' class='close' data-dismiss='modal' aria-label='Close' onclick='closeCommandHistory()'><span aria-hidden='true'>&times;</span></button></div><div class='modal-body'><div id='command_history_div_" + v_tab.id + "' class='query_command_history'><div id='command_history_header_" + v_tab.id + "' class='query_command_history_header'></div><div id='command_history_grid_" + v_tab.id + "' class='query_command_history_grid' style='width: 100%; height: calc(100vh - 16.5rem); overflow: hidden;'></div></div></div></div></div></div>";
    var v_html = '<div id="txt_query_' + v_tab.id + '" style="width: 100%; height: 200px;"></div><div class="omnidb__resize-line__container" onmousedown="resizeVertical(event)" style="width: 100%; height: 5px; cursor: ns-resize;"><div class="resize_line_horizontal" style="height: 0px; border-bottom: 1px dashed #acc4e8;"></div><div style="height:5px;"></div></div>' + command_history_modal + '<div class="row mb-1"><div class="tab_actions omnidb__tab-actions col-12"><button id="bt_start_' + v_tab.id + '" class="btn btn-sm omnidb__theme__btn--primary omnidb__tab-actions__btn" title="Run" onclick="querySQL(0);"><i class="fas fa-play fa-light"></i></button><button id="bt_indent_' + v_tab.id + '" class="btn btn-sm omnidb__theme__btn--secondary omnidb__tab-actions__btn" title="Indent SQL" onclick="indentSQL();"><i class="fas fa-indent fa-light"></i></button><button id="bt_history_' + v_tab.id + '" class="btn btn-sm omnidb__theme__btn--secondary omnidb__tab-actions__btn" title="Command History" onclick="showCommandList();"><i class="fas fa-list fa-light"></i></button><button id="bt_explain_' + v_tab.id + '" class="dbms_object postgresql_object btn btn-sm omnidb__theme__btn--secondary omnidb__tab-actions__btn" onclick="getExplain(0)" title="Explain" style="display: none;"><i class="fas fa-search fa-light"></i></button><button id="bt_analyze_' + v_tab.id + '" class="dbms_object postgresql_object btn btn-sm omnidb__theme__btn--secondary omnidb__tab-actions__btn" onclick="getExplain(1)" title="Explain Analyze" style="display: none;"><i class="fas fa-search-plus fa-light"></i></button><div class="dbms_object postgresql_object omnidb__form-check form-check form-check-inline"><input id="check_autocommit_' + v_tab.id + '" class="form-check-input" type="checkbox" checked="checked"><label class="form-check-label dbms_object postgresql_object custom_checkbox query_info" for="check_autocommit_' + v_tab.id + '">Autocommit</label></div><div class="dbms_object postgresql_object omnidb__tab-status"><i id="query_tab_status_' + v_tab.id + '" title="Not connected" class="fas fa-dot-circle tab-status tab-status-closed dbms_object postgresql_object omnidb__tab-status__icon"></i><span id="query_tab_status_text_' + v_tab.id + '" title="Not connected" class="tab-status-text query_info dbms_object postgresql_object ms-1">Not connected</span></div><button id="bt_fetch_more_' + v_tab.id + '" class="btn btn-sm omnidb__theme__btn--secondary omnidb__tab-actions__btn" title="Run" style="display: none;" onclick="querySQL(1);">Fetch more</button><button id="bt_fetch_all_' + v_tab.id + '" class="btn btn-sm omnidb__theme__btn--secondary omnidb__tab-actions__btn" title="Run" style="display: none;" onclick="querySQL(2);">Fetch all</button><button id="bt_commit_' + v_tab.id + '" class="dbms_object dbms_object_hidden postgresql_object btn btn-sm omnidb__theme__btn--primary omnidb__tab-actions__btn" title="Run" style="display: none;" onclick="querySQL(3);">Commit</button><button id="bt_rollback_' + v_tab.id + '" class="dbms_object dbms_object_hidden postgresql_object btn btn-sm omnidb__theme__btn--secondary omnidb__tab-actions__btn" title="Run" style="display: none;" onclick="querySQL(4);">Rollback</button><button id="bt_cancel_' + v_tab.id + '" class="btn btn-sm btn-danger omnidb__tab-actions__btn" title="Cancel" style="display: none;" onclick="cancelSQL();">Cancel</button><div id="div_query_info_' + v_tab.id + '" class="omnidb__query-info"></div><button class="btn btn-sm omnidb__theme__btn--primary omnidb__tab-actions__btn ms-auto" title="Export Data" onclick="v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.exportData();"><i class="far fa-file fa-light"></i></button><select id="sel_export_type_' + v_tab.id + '" class="form-control omnidb__tab-actions__select" style="width: 80px;"><option selected="selected" value="csv">CSV</option><option value="tsv">TSV</option><option value="xlsx">XLSX</option><option value="json">JSON</option><option value="xml">XML</option><option value="md">Markdown</option></select></div></div><div id="query_result_tabs_container' + v_tab.id + '" class="omnidb__query-result-tabs"><div style="position:absolute;top:0.25rem;right:2.75rem;"><div class="omnidb__switch--explain omnidb__switch--explain--sm float-end me-1" data-bs-toggle="tooltip" data-bs-placement="left" data-bs-html="true" title="" data-bs-original-title="<h5>Toggle explain component.</h5><div>Switch between old and new explain visualizer (experimental).</div>"><input id="explainContextToggler' + v_tab.id + '" type="checkbox" class="omnidb__switch--explain--input" onclick="toggleExplainContext()"><label for="explainContextToggler' + v_tab.id + '" class="omnidb__switch--explain--label"><span><i class="fas fa-th"></i></span></label></div></div><button style="position:absolute;top:0.25rem;right:0.25rem;" type="button" class="btn btn-sm omnidb__theme__btn--secondary" onclick=toggleExpandToPanelView("query_result_tabs_container' + v_tab.id + '")><i class="fas fa-expand"></i></button><div id="query_result_tabs_' + v_tab.id + '"></div></div>';
    v_tab.elementDiv.innerHTML = v_html;
    var v_curr_tabs = createTabControl({ p_div: "query_result_tabs_" + v_tab.id });
    var v_selectDataTabFunc = function() {
      v_curr_tabs.selectTabIndex(0);
      v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.currQueryTab = "data";
      v_tab.tag.resize();
    };
    var v_selectMessageTabFunc = function() {
      v_curr_tabs.selectTabIndex(1);
      v_tag.currQueryTab = "message";
      v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_count_notices.style.display = "none";
      v_tab.tag.resize();
    };
    var v_selectExplainTabFunc = function() {
      v_curr_tabs.selectTabIndex(2);
      v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.currQueryTab = "explain";
      v_tab.tag.resize();
      $('[data-bs-toggle="tooltip"]').tooltip({ animation: true, html: true });
    };
    var v_data_tab = v_curr_tabs.createTab({
      p_name: "Data",
      p_close: false,
      p_clickFunction: function(e) {
        v_selectDataTabFunc();
      }
    });
    v_data_tab.elementDiv.innerHTML = "<div class='p-2 omnidb__query-result-tabs__content omnidb__theme-border--primary'><div id='div_result_" + v_tab.id + "' class='omnidb__query-result-tabs__content' style='width: 100%; overflow: hidden;'></div></div>";
    var v_messages_tab = v_curr_tabs.createTab({
      p_name: "Messages <div id='query_result_tabs_count_notices_" + v_tab.id + "' class='count_notices' style='display: none;'></div>",
      p_close: false,
      p_clickFunction: function(e) {
        v_selectMessageTabFunc();
      }
    });
    v_messages_tab.elementDiv.innerHTML = "<div class='p-2 omnidb__query-result-tabs__content omnidb__theme-border--primary'><div id='div_notices_" + v_tab.id + "' class='omnidb__query-result-tabs__content' style='width: 100%; overflow: hidden;'></div></div>";
    v_messages_tab.elementA.classList.add("dbms_object");
    v_messages_tab.elementA.classList.add("postgresql_object");
    var v_explain_tab = v_curr_tabs.createTab({
      p_name: "Explain",
      p_close: false,
      p_clickFunction: function(e) {
        v_selectExplainTabFunc();
      }
    });
    v_explain_tab.elementDiv.innerHTML = "<div class='p-2 omnidb__query-result-tabs__content omnidb__theme-border--primary'><div id='div_explain_default" + v_tab.id + "' class='omnidb__query-result-tabs__content omnidb__query-result-tabs__content--explain-default' style='width: 100%; overflow: auto;'></div><div id='div_explain_" + v_tab.id + "' class='omnidb__query-result-tabs__content omnidb__query-result-tabs__content--explain-legere' style='width: 100%; overflow: hidden;'></div></div>";
    v_explain_tab.elementA.classList.add("dbms_object");
    v_explain_tab.elementA.classList.add("postgresql_object");
    ace.require("ace/ext/language_tools");
    var v_editor = ace.edit("txt_query_" + v_tab.id);
    v_editor.$blockScrolling = Infinity;
    v_editor.setTheme("ace/theme/" + v_editor_theme);
    v_editor.session.setMode("ace/mode/sql");
    v_editor.setFontSize(Number(v_font_size));
    v_editor.session.setTabSize(v_indent_size || 4);
    v_editor.session.setUseSoftTabs(v_indent_char !== "tab");
    $("#txt_query_" + v_tab.id).find(".ace_text-input").on("keyup", function(event2) {
      if (v_connTabControl.selectedTab.tag.enable_autocomplete !== false) {
        autocomplete_start(v_editor, 0, event2);
      }
    });
    $("#txt_query_" + v_tab.id).find(".ace_text-input").on("keydown", function(event2) {
      if (v_connTabControl.selectedTab.tag.enable_autocomplete !== false) {
        autocomplete_keydown(v_editor, event2);
      } else {
        autocomplete_update_editor_cursor(v_editor, event2);
      }
    });
    document.getElementById("txt_query_" + v_tab.id).addEventListener("contextmenu", function(event2) {
      event2.stopPropagation();
      event2.preventDefault();
      var v_option_list = [
        {
          text: "Copy",
          icon: "fas cm-all fa-terminal",
          action: function() {
            var copy_text = v_editor.getValue();
            uiCopyTextToClipboard(copy_text);
          }
        },
        {
          text: "Save as snippet",
          icon: "fas cm-all fa-save",
          submenu: {
            elements: buildSnippetContextMenuObjects("save", v_connTabControl.tag.globalSnippets, v_editor)
          }
        }
      ];
      if (v_connTabControl.tag.globalSnippets.files.length != 0 || v_connTabControl.tag.globalSnippets.folders.length != 0)
        v_option_list.push({
          text: "Use snippet",
          icon: "fas cm-all fa-book",
          submenu: {
            elements: buildSnippetContextMenuObjects("load", v_connTabControl.tag.globalSnippets, v_editor)
          }
        });
      customMenu(
        {
          x: event2.clientX + 5,
          y: event2.clientY + 5
        },
        v_option_list,
        null
      );
    });
    v_editor.commands.bindKey("ctrl-space", null);
    v_editor.commands.bindKey("alt-e", null);
    v_editor.commands.bindKey("Cmd-,", null);
    v_editor.commands.bindKey("Ctrl-,", null);
    v_editor.commands.bindKey("Cmd-Delete", null);
    v_editor.commands.bindKey("Ctrl-Delete", null);
    v_editor.commands.bindKey("Ctrl-Up", null);
    v_editor.commands.bindKey("Ctrl-Down", null);
    v_editor.commands.bindKey("Up", null);
    v_editor.commands.bindKey("Down", null);
    v_editor.commands.bindKey("Tab", null);
    document.getElementById("txt_query_" + v_tab.id).onclick = function() {
      v_editor.focus();
    };
    var v_tab_db_id = null;
    if (p_tab_db_id) {
      v_tab_db_id = p_tab_db_id;
    }
    var v_export_data = function() {
      var v_exp_callback = function(p_data) {
        if (!gv_desktopMode) {
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.selectDataTabFunc();
          var v_text = '<div style="font-size: 14px;">The file is ready. <a class="link_text" href="' + p_data.v_data.v_filename + '" download="' + p_data.v_data.v_downloadname + '">Save</a></div>';
          v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result.innerHTML = v_text;
          return;
        }
        fetch("/export_save_dialog/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            v_filepath: p_data.v_data.v_filepath,
            v_downloadname: p_data.v_data.v_downloadname
          })
        }).then(function(p_response) {
          return p_response.json();
        }).then(function(p_result) {
          if (p_result.error) {
            showAlert("Error saving file: " + p_result.error);
          } else if (p_result.path) {
            showAlert("File exported to: " + p_result.path);
          }
        }).catch(function(p_error) {
          showAlert("Error saving file: " + p_error);
        });
      };
      var v_exp_query = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.getValue();
      var v_exp_type = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.sel_export_type.value;
      querySQL(0, true, v_exp_query, v_exp_callback, true, v_exp_query, "export_" + v_exp_type, true);
    };
    var v_resizeFunction = function() {
      var v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;
      if (v_tab_tag.currQueryTab == "data") {
        v_tab_tag.div_result.style.height = window.innerHeight - $(v_tab_tag.div_result).offset().top - 1.25 * v_font_size + "px";
        setTimeout(function() {
          if (v_tab_tag.ht != null) {
            v_tab_tag.ht.render();
          }
          if (v_tab_tag.editor != null) {
            v_tab_tag.editor.resize();
          }
        }, 400);
      } else if (v_tab_tag.currQueryTab == "message") {
        v_tab_tag.div_notices.style.height = window.innerHeight - $(v_tab_tag.div_notices).offset().top - 1.25 * v_font_size + "px";
      } else if (v_tab_tag.currQueryTab == "explain") {
        v_tab_tag.div_explain_default.style.height = window.innerHeight - $(v_tab_tag.div_explain_default).offset().top - 1.25 * v_font_size + "px";
        v_tab_tag.div_explain.style.height = window.innerHeight - $(v_tab_tag.div_explain).offset().top - 1.25 * v_font_size + "px";
        setTimeout(function() {
          if (v_tab_tag.explainControl) {
            v_tab_tag.explainControl.resize();
          }
        }, 400);
      }
    };
    var v_tag = {
      tab_id: v_tab.id,
      mode: "query",
      editor: v_editor,
      editorDivId: "txt_query_" + v_tab.id,
      exportData: v_export_data,
      query_info: document.getElementById("div_query_info_" + v_tab.id),
      div_result: document.getElementById("div_result_" + v_tab.id),
      div_notices: document.getElementById("div_notices_" + v_tab.id),
      div_explain: document.getElementById("div_explain_" + v_tab.id),
      div_explain_default: document.getElementById("div_explain_default" + v_tab.id),
      div_count_notices: document.getElementById("query_result_tabs_count_notices_" + v_tab.id),
      sel_filtered_data: document.getElementById("sel_filtered_data_" + v_tab.id),
      sel_export_type: document.getElementById("sel_export_type_" + v_tab.id),
      tab_title_span: v_tab_title_span,
      tab_loading_span: v_tab_loading_span,
      tab_check_span: v_tab_check_span,
      query_tab_status: document.getElementById("query_tab_status_" + v_tab.id),
      query_tab_status_text: document.getElementById("query_tab_status_text_" + v_tab.id),
      bt_start: document.getElementById("bt_start_" + v_tab.id),
      bt_fetch_more: document.getElementById("bt_fetch_more_" + v_tab.id),
      bt_fetch_all: document.getElementById("bt_fetch_all_" + v_tab.id),
      bt_commit: document.getElementById("bt_commit_" + v_tab.id),
      bt_rollback: document.getElementById("bt_rollback_" + v_tab.id),
      bt_start: document.getElementById("bt_start_" + v_tab.id),
      bt_indent: document.getElementById("bt_indent_" + v_tab.id),
      bt_explain: document.getElementById("bt_explain_" + v_tab.id),
      bt_analyze: document.getElementById("bt_analyze_" + v_tab.id),
      bt_history: document.getElementById("bt_history_" + v_tab.id),
      bt_cancel: document.getElementById("bt_cancel_" + v_tab.id),
      bt_export: document.getElementById("bt_export_" + v_tab.id),
      check_autocommit: document.getElementById("check_autocommit_" + v_tab.id),
      resize: v_resizeFunction,
      state: 0,
      context: null,
      tabControl: v_connTabControl.selectedTab.tag.tabControl,
      queryTabControl: v_curr_tabs,
      currQueryTab: null,
      connTab: v_connTabControl.selectedTab,
      currDatabaseIndex: null,
      tab_db_id: v_tab_db_id,
      tempData: [],
      commandHistory: {
        modal: document.getElementById("modal_command_history_" + v_tab.id),
        div: document.getElementById("command_history_div_" + v_tab.id),
        headerDiv: document.getElementById("command_history_header_" + v_tab.id),
        gridDiv: document.getElementById("command_history_grid_" + v_tab.id),
        grid: null,
        currentPage: 1,
        pages: 1,
        spanNumPages: null,
        spanCurrPage: null,
        inputStartedFrom: null,
        inputStartedFromLastValue: null,
        inputStartedTo: null,
        inputStartedToLastValue: null,
        inputCommandContains: null,
        inputCommandContainsLastValue: null
      }
    };
    v_tab.tag = v_tag;
    v_tag.selectDataTabFunc = v_selectDataTabFunc;
    v_tag.selectMessageTabFunc = v_selectMessageTabFunc;
    v_tag.selectExplainTabFunc = v_selectExplainTabFunc;
    v_selectDataTabFunc();
    var v_add_tab = v_connTabControl.selectedTab.tag.tabControl.createTab({
      p_name: "+",
      p_close: false,
      p_selectable: false,
      p_clickFunction: function(e) {
        showMenuNewTab(e);
      }
    });
    v_add_tab.tag = {
      mode: "add"
    };
    $('[data-bs-toggle="tooltip"]').tooltip({ animation: true, html: true });
    setTimeout(function() {
      v_resizeFunction();
    }, 10);
    adjustQueryTabObjects(false);
    v_editor.focus();
    $(v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.modal).on("shown.bs.modal", function() {
      v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.grid.render();
    });
  };
  const innerQueryTab = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    v_createQueryTabFunction
  }, Symbol.toStringTag, { value: "Module" }));
  var v_createConsoleTabFunction = function() {
    v_connTabControl.selectedTab.tag.tabControl.removeLastTab();
    var v_tab = v_connTabControl.selectedTab.tag.tabControl.createTab({
      p_icon: '<i class="fas fa-terminal icon-tab-title"></i>',
      p_name: '<span> Console</span><span id="tab_loading" style="visibility:hidden;"><i class="tab-icon node-spin"></i></span><i title="" id="tab_check" style="display: none;" class="fas fa-check-circle tab-icon icon-check"></i></span>',
      p_selectFunction: function() {
        if (this.tag != null) {
          this.tag.resize();
        }
        if (this.tag != null && this.tag.editor_input != null) {
          this.tag.editor_input.focus();
          checkConsoleStatus(this);
        }
      },
      p_closeFunction: function(e, p_tab) {
        var v_current_tab = p_tab;
        beforeCloseTab(e, function() {
          removeTab(v_current_tab);
        });
      }
    });
    v_connTabControl.selectedTab.tag.tabControl.selectTab(v_tab);
    var v_tab_loading_span = document.getElementById("tab_loading");
    v_tab_loading_span.id = "tab_loading_" + v_tab.id;
    var v_tab_check_span = document.getElementById("tab_check");
    v_tab_check_span.id = "tab_check_" + v_tab.id;
    var console_history_modal = "<div class='modal fade' id='modal_console_history_" + v_tab.id + "' tabindex='-1' role='dialog' aria-hidden='true'><div class='modal-dialog modal-xl' role='document'><div class='modal-content'><div class='modal-header'><h5 class='modal-title'>Console commands history</h5><button type='button' class='close' data-dismiss='modal' aria-label='Close' onclick='closeConsoleHistory()'><span aria-hidden='true'>&times;</span></button></div><div class='modal-body'><div id='console_history_div_" + v_tab.id + "' class='console_command_history'><div id='console_history_header_" + v_tab.id + "' class='console_command_history_header'></div><div id='console_history_grid_" + v_tab.id + "' class='console_command_history_grid' style='width: 100%; height: calc(100vh - 16.5rem); overflow: hidden;'></div></div></div></div></div></div>";
    var v_html = "<div id='txt_console_" + v_tab.id + "' class='omnidb__txt-console' style=' width: 100%; height: 120px;'></div><div class='omnidb__resize-line__container' onmousedown='resizeVertical(event)' style='width: 100%; height: 5px; cursor: ns-resize;'><div class='resize_line_horizontal' style='height: 0px; border-bottom: 1px dashed #acc4e8;'></div><div style='height:5px;'></div></div>" + console_history_modal + "<div class='row mb-1'><div class='tab_actions omnidb__tab-actions col-12'><button id='bt_start_" + v_tab.id + "' class='btn btn-sm omnidb__theme__btn--primary omnidb__tab-actions__btn' title='Run' onclick='consoleSQL(false);'><i class='fas fa-play fa-light'></i></button><button id='bt_indent_" + v_tab.id + "' class='btn btn-sm omnidb__theme__btn--secondary omnidb__tab-actions__btn' title='Indent SQL' onclick='indentSQL();'><i class='fas fa-indent fa-light'></i></button><button id='bt_clear_" + v_tab.id + "' class='btn btn-sm omnidb__theme__btn--secondary omnidb__tab-actions__btn' title='Clear Console' onclick='clearConsole();'><i class='fas fa-broom fa-light'></i></button><button id='bt_history_" + v_tab.id + "' class='btn btn-sm omnidb__theme__btn--secondary omnidb__tab-actions__btn' title='Command History' onclick='showConsoleHistory();'><i class='fas fa-list fa-light'></i></button><div class='dbms_object postgresql_object omnidb__form-check form-check form-check-inline'><input id='check_autocommit_" + v_tab.id + "' class='form-check-input' type='checkbox' checked='checked'><label class='form-check-label dbms_object postgresql_object custom_checkbox query_info' for='check_autocommit_" + v_tab.id + "'>Autocommit</label></div><div class='dbms_object postgresql_object omnidb__tab-status'><i id='query_tab_status_" + v_tab.id + "' title='Not connected' class='fas fa-dot-circle tab-status tab-status-closed dbms_object postgresql_object omnidb__tab-status__icon'></i><span id='query_tab_status_text_" + v_tab.id + "' title='Not connected' class='tab-status-text query_info dbms_object postgresql_object ms-1'>Not connected</span></div><button id='bt_fetch_more_" + v_tab.id + "' class='btn btn-sm omnidb__theme__btn--secondary omnidb__tab-actions__btn' title='Fetch More' style='display: none; ' onclick='consoleSQL(false,1);'>Fetch more</button><button id='bt_fetch_all_" + v_tab.id + "' class='btn btn-sm omnidb__theme__btn--secondary omnidb__tab-actions__btn' title='Fetch All' style='margin-left: 5px; display: none; ' onclick='consoleSQL(false,2);'>Fetch all</button><button id='bt_skip_fetch_" + v_tab.id + "' class='btn btn-sm omnidb__theme__btn--secondary omnidb__tab-actions__btn' title='Skip Fetch' style='margin-left: 5px; display: none; ' onclick='consoleSQL(false,3);'>Skip Fetch</button><button id='bt_commit_" + v_tab.id + "' class='dbms_object dbms_object_hidden postgresql_object btn btn-sm omnidb__theme__btn--primary omnidb__tab-actions__btn' title='Run' style='margin-left: 5px; display: none; ' onclick='querySQL(3);'>Commit</button><button id='bt_rollback_" + v_tab.id + "' class='dbms_object dbms_object_hidden postgresql_object btn btn-sm omnidb__theme__btn--secondary omnidb__tab-actions__btn' title='Run' style='margin-left: 5px; display: none; ' onclick='querySQL(4);'>Rollback</button><button id='bt_cancel_" + v_tab.id + "' class='btn btn-sm btn-danger omnidb__tab-actions__btn' title='Cancel' style=' display: none;' onclick='cancelConsole();'>Cancel</button><div id='div_query_info_" + v_tab.id + "' class='omnidb__query-info'></div></div></div><div id='txt_input_" + v_tab.id + "' class='omnidb__console__text-input' style=' width: 100%; height: 150px; border: 1px solid #c3c3c3;'></div>";
    document.getElementById("div_" + v_tab.id);
    v_tab.elementDiv.innerHTML = v_html;
    ace.require("ace/ext/language_tools");
    var v_editor1 = ace.edit("txt_input_" + v_tab.id);
    v_editor1.$blockScrolling = Infinity;
    v_editor1.setTheme("ace/theme/" + v_editor_theme);
    v_editor1.session.setMode("ace/mode/sql");
    v_editor1.setFontSize(Number(v_font_size));
    $("#txt_input_" + v_tab.id).find(".ace_text-input").on("keyup", function(event2) {
      if (v_connTabControl.selectedTab.tag.enable_autocomplete !== false) {
        autocomplete_start(v_editor1, 1, event2);
      }
    });
    $("#txt_input_" + v_tab.id).find(".ace_text-input").on("keydown", function(event2) {
      if (v_connTabControl.selectedTab.tag.enable_autocomplete !== false) {
        autocomplete_keydown(v_editor1, event2);
      } else {
        autocomplete_update_editor_cursor(v_editor1, event2);
      }
    });
    v_editor1.commands.bindKey("ctrl-space", null);
    v_editor1.commands.bindKey("Cmd-,", null);
    v_editor1.commands.bindKey("Ctrl-,", null);
    v_editor1.commands.bindKey("Cmd-Delete", null);
    v_editor1.commands.bindKey("Ctrl-Delete", null);
    v_editor1.commands.bindKey("Ctrl-Up", null);
    v_editor1.commands.bindKey("Ctrl-Down", null);
    v_editor1.commands.bindKey("Up", null);
    v_editor1.commands.bindKey("Down", null);
    v_editor1.commands.bindKey("Tab", null);
    document.getElementById("txt_input_" + v_tab.id).onclick = function() {
      v_editor1.focus();
    };
    document.getElementById("txt_input_" + v_tab.id).addEventListener("contextmenu", function(event2) {
      event2.stopPropagation();
      event2.preventDefault();
      var v_option_list = [
        {
          text: "Copy",
          icon: "fas cm-all fa-terminal",
          action: function() {
            var copy_text = v_editor1.getValue();
            uiCopyTextToClipboard(copy_text);
          }
        },
        {
          text: "Save as snippet",
          icon: "fas cm-all fa-save",
          submenu: {
            elements: buildSnippetContextMenuObjects("save", v_connTabControl.tag.globalSnippets, v_editor1)
          }
        }
      ];
      if (v_connTabControl.tag.globalSnippets.files.length != 0 || v_connTabControl.tag.globalSnippets.folders.length != 0)
        v_option_list.push({
          text: "Use snippet",
          icon: "fas cm-all fa-book",
          submenu: {
            elements: buildSnippetContextMenuObjects("load", v_connTabControl.tag.globalSnippets, v_editor1)
          }
        });
      customMenu(
        {
          x: event2.clientX + 5,
          y: event2.clientY + 5
        },
        v_option_list,
        null
      );
    });
    v_editor1.focus();
    var v_editor2 = new Terminal({
      fontSize: v_font_size,
      theme: v_current_terminal_theme,
      fontFamily: "Monospace"
    });
    v_editor2.open(document.getElementById("txt_console_" + v_tab.id));
    v_editor2.write(v_connTabControl.selectedTab.tag.consoleHelp);
    Terminal.applyAddon(fit);
    v_editor2.fit();
    var v_resizeFunction = function() {
      var v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;
      if (v_tab_tag.div_console) {
        v_tab_tag.div_console.style.height = window.innerHeight - $(v_tab_tag.div_console).offset().top - parseInt(v_tab_tag.div_result.style.height, 10) - 1.25 * v_font_size - 38 + "px";
        v_tab_tag.editor_console.resize();
        v_tab_tag.editor_input.resize();
        v_tab_tag.editor_console.fit();
      }
    };
    var v_tag = {
      tab_id: v_tab.id,
      mode: "console",
      editor_input: v_editor1,
      editor_console: v_editor2,
      editorDivId: "txt_console_" + v_tab.id,
      div_console: document.getElementById("txt_console_" + v_tab.id),
      div_result: document.getElementById("txt_input_" + v_tab.id),
      query_info: document.getElementById("div_query_info_" + v_tab.id),
      query_tab_status: document.getElementById("query_tab_status_" + v_tab.id),
      query_tab_status_text: document.getElementById("query_tab_status_text_" + v_tab.id),
      bt_start: document.getElementById("bt_start_" + v_tab.id),
      bt_fetch_more: document.getElementById("bt_fetch_more_" + v_tab.id),
      bt_fetch_all: document.getElementById("bt_fetch_all_" + v_tab.id),
      bt_skip_fetch: document.getElementById("bt_skip_fetch_" + v_tab.id),
      bt_commit: document.getElementById("bt_commit_" + v_tab.id),
      bt_rollback: document.getElementById("bt_rollback_" + v_tab.id),
      bt_indent: document.getElementById("bt_indent_" + v_tab.id),
      bt_cancel: document.getElementById("bt_cancel_" + v_tab.id),
      check_autocommit: document.getElementById("check_autocommit_" + v_tab.id),
      tab_loading_span: v_tab_loading_span,
      tab_check_span: v_tab_check_span,
      context: null,
      tabControl: v_connTabControl.selectedTab.tag.tabControl,
      connTab: v_connTabControl.selectedTab,
      currDatabaseIndex: null,
      resize: v_resizeFunction,
      state: 0,
      // console_history_modal: document.getElementById('modal_console_history_' + v_tab.id),
      // console_history_div: document.getElementById('console_history_div_' + v_tab.id),
      // console_history_grid_div: document.getElementById('console_history_grid_' + v_tab.id),
      // console_history_grid: null,
      console_history_cmd_index: -1,
      tempData: [],
      consoleHistory: {
        modal: document.getElementById("modal_console_history_" + v_tab.id),
        div: document.getElementById("console_history_div_" + v_tab.id),
        headerDiv: document.getElementById("console_history_header_" + v_tab.id),
        gridDiv: document.getElementById("console_history_grid_" + v_tab.id),
        grid: null,
        currentPage: 1,
        pages: 1,
        spanNumPages: null,
        spanCurrPage: null,
        inputStartedFrom: null,
        inputStartedFromLastValue: null,
        inputStartedTo: null,
        inputStartedToLastValue: null,
        inputCommandContains: null,
        inputCommandContainsLastValue: null
      }
    };
    v_tab.tag = v_tag;
    var v_add_tab = v_connTabControl.selectedTab.tag.tabControl.createTab({
      p_name: "+",
      p_close: false,
      p_selectable: false,
      p_clickFunction: function(e) {
        showMenuNewTab(e);
      }
    });
    v_add_tab.tag = {
      mode: "add"
    };
    setTimeout(function() {
      v_resizeFunction();
    }, 10);
    adjustQueryTabObjects(false);
    $(v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.consoleHistory.modal).on("shown.bs.modal", function() {
      v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.consoleHistory.grid.render();
    });
  };
  const innerConsoleTab = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    v_createConsoleTabFunction
  }, Symbol.toStringTag, { value: "Module" }));
  var v_createMonitorDashboardTabFunction = function() {
    v_connTabControl.selectedTab.tag.tabControl.removeLastTab();
    let v_name_html = '<span id="tab_title"> Monitoring</span><span id="tab_loading" style="visibility:hidden;"><i class="tab-icon node-spin"></i></span><i title="" id="tab_check" style="display: none;" class="fas fa-check-circle tab-icon icon-check"></i>';
    var v_tab = v_connTabControl.selectedTab.tag.tabControl.createTab({
      p_icon: '<i class="fas fa-chart-bar icon-tab-title"></i>',
      p_name: v_name_html,
      p_selectFunction: function() {
        if (this.tag != null) {
          this.tag.resize();
          refreshMonitorUnitsObjects();
          if (this.tag.unit_list_grid != null) {
            showMonitorUnitList();
          }
        }
      },
      p_closeFunction: function(e, p_tab) {
        beforeCloseTab(e, function() {
          closeMonitorDashboardTab(v_tab);
          if (v_tab.tag.tabCloseFunction) v_tab.tag.tabCloseFunction(v_tab.tag);
        });
      },
      p_dblClickFunction: renameTab
    });
    v_connTabControl.selectedTab.tag.tabControl.selectTab(v_tab);
    var v_tab_title_span = document.getElementById("tab_title");
    v_tab_title_span.id = "tab_title_" + v_tab.id;
    var v_tab_loading_span = document.getElementById("tab_loading");
    v_tab_loading_span.id = "tab_loading_" + v_tab.id;
    var v_tab_check_span = document.getElementById("tab_check");
    v_tab_check_span.id = "tab_check_" + v_tab.id;
    var v_html = "<div class='omnidb__monitoring-result-tabs'><div class='container-fluid'><button class='btn omnidb__theme__btn--primary btn-sm my-2 me-2' onclick='refreshMonitorDashboard(true)'><i class='fas fa-sync-alt me-2'></i>Refresh All</button><button class='btn omnidb__theme__btn--primary btn-sm my-2' onclick='showMonitorUnitList()'>Manage Units</button><div id='dashboard_" + v_tab.id + "' class='dashboard_all row'></div></div></div>";
    v_tab.elementDiv.innerHTML = v_html;
    var v_resizeFunction = function() {
      var v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;
      if (v_tab_tag.dashboard_div) {
        v_tab_tag.dashboard_div.style.height = window.innerHeight - $(v_tab_tag.dashboard_div).offset().top - $(v_tab_tag.dashboard_div.parentElement).scrollTop() - 0.833 * v_font_size + "px";
      }
    };
    var v_tag = {
      tab_id: v_tab.id,
      mode: "monitor_dashboard",
      dashboard_div: document.getElementById("dashboard_" + v_tab.id),
      unit_list_div: document.getElementById("unit_list_div_" + v_tab.id),
      unit_list_grid_div: document.getElementById("unit_list_grid_" + v_tab.id),
      unit_list_grid: null,
      unit_list_id_list: [],
      tab_title_span: v_tab_title_span,
      tab_loading_span: v_tab_loading_span,
      tab_check_span: v_tab_check_span,
      tabControl: v_connTabControl.selectedTab.tag.tabControl,
      units: [],
      unit_sequence: 0,
      tab_active: true,
      connTabTag: v_connTabControl.selectedTab.tag,
      resize: v_resizeFunction,
      tabCloseFunction: function(p_tag) {
        for (var i2 = 0; i2 < p_tag.units.length; i2++) {
          try {
            p_tag.units[i2].object.destroy();
          } catch (err) {
          }
        }
      }
    };
    v_tab.tag = v_tag;
    var v_add_tab = v_connTabControl.selectedTab.tag.tabControl.createTab({
      p_name: "+",
      p_close: false,
      p_selectable: false,
      p_clickFunction: function(e) {
        showMenuNewTab(e);
      }
    });
    v_add_tab.tag = {
      mode: "add"
    };
    setTimeout(function() {
      v_resizeFunction();
    }, 10);
  };
  var v_createNewMonitorUnitTabFunction = function() {
    v_connTabControl.selectedTab.tag.tabControl.removeLastTab();
    let v_name_html = '<span id="tab_title">Monitor Unit</span><span id="tab_loading" style="visibility:hidden;"><i class="tab-icon node-spin"></i></span><i title="" id="tab_check" style="display: none;" class="fas fa-check-circle tab-icon icon-check"></i>';
    var v_tab = v_connTabControl.selectedTab.tag.tabControl.createTab({
      p_icon: '<i class="fas fa-align-left icon-tab-title"></i>',
      p_name: v_name_html,
      p_selectFunction: function() {
        if (this.tag != null) {
          this.tag.resize();
        }
      },
      p_closeFunction: function(e, p_tab) {
        var v_current_tab = p_tab;
        beforeCloseTab(e, function() {
          removeTab(v_current_tab);
          if (v_tab.tag.tabCloseFunction) v_tab.tag.tabCloseFunction(v_tab.tag);
        });
      },
      p_dblClickFunction: renameTab
    });
    v_connTabControl.selectedTab.tag.tabControl.selectTab(v_tab);
    var v_html = '<button class="btn omnidb__theme__btn--secondary btn-sm my-1 me-1" onclick="testMonitorScript()">Test</button><button class="btn omnidb__theme__btn--secondary btn-sm my-1" onclick="saveMonitorScript()">Save</button><div class="row">  <div class="col-md-3 mb-3">    <label for="conn_form_title">Name</label>    <input type="text" class="form-control" id="txt_unit_name_' + v_tab.id + '" placeholder="Name">  </div>  <div class="col-md-3 mb-3">    <label for="conn_form_type">Type</label>    <select id="select_type_' + v_tab.id + '" onchange="toggleMonitorUnitChartType(' + v_tab.id + ')" class="form-control">      <option value="timeseries">Timeseries</option>      <option value="chart">Chart (No Append)</option>      <option value="grid">Grid</option>    </select>  </div>  <div class="col-md-3 mb-3">    <label for="conn_form_title">Refresh Interval</label>    <input type="text" class="form-control" id="txt_interval_' + v_tab.id + '" placeholder="Title">  </div>  <div class="col-md-3 mb-3">    <label for="conn_form_type">Template</label>    <select id="select_template_' + v_tab.id + '" onchange="selectUnitTemplate(this.value)" class="form-control">      <option value=-1>Select Template</option>    </select>  </div></div><div class="row" id="chart_type_row_' + v_tab.id + '" style="display:none;">  <div class="col-md-3 mb-3">    <label for="conn_form_type">Chart Type</label>    <select id="select_chart_type_' + v_tab.id + '" class="form-control">      <option value="bar">Bar</option>      <option value="pie">Pie</option>      <option value="doughnut">Doughnut</option>      <option value="line">Line</option>    </select>  </div></div><div class="row">  <div class="col-md-12 mb-1">    <label for="conn_form_title">SQL Query</label>  </div>  <div class="col-md-12">    <div id="txt_data_' + v_tab.id + '" style=" width: 100%; height: 250px;"></div>  </div></div>';
    var v_div = document.getElementById("div_" + v_tab.id);
    v_div.innerHTML = v_html;
    ace.require("ace/ext/language_tools");
    var v_select_chart_type = document.getElementById("select_chart_type_" + v_tab.id);
    var v_editor = {
      getValue: function() {
        return v_select_chart_type.value;
      },
      setValue: function(v) {
        v_select_chart_type.value = v || "bar";
      },
      clearSelection: function() {
      },
      gotoLine: function() {
      },
      resize: function() {
      }
    };
    var v_txt_data = document.getElementById("txt_data_" + v_tab.id);
    var v_editor_data = ace.edit("txt_data_" + v_tab.id);
    v_editor_data.$blockScrolling = Infinity;
    v_editor_data.setTheme("ace/theme/" + v_editor_theme);
    v_editor_data.session.setMode("ace/mode/sql");
    v_editor_data.setFontSize(Number(v_font_size));
    v_editor_data.commands.bindKey("ctrl-space", null);
    v_editor_data.commands.bindKey("Cmd-,", null);
    v_editor_data.commands.bindKey("Ctrl-,", null);
    v_editor_data.commands.bindKey("Cmd-Delete", null);
    v_editor_data.commands.bindKey("Ctrl-Delete", null);
    v_editor_data.commands.bindKey("Ctrl-Up", null);
    v_editor_data.commands.bindKey("Ctrl-Down", null);
    var v_resizeFunction = function() {
      var v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;
      if (v_tab_tag.editorDataDiv) {
        var v_new_height = window.innerHeight - $(v_tab_tag.editorDataDiv).offset().top - v_font_size + "px";
        v_tab_tag.editorDataDiv.style.height = v_new_height;
        v_tab_tag.editor_data.resize();
      }
    };
    var v_tag = {
      tab_id: v_tab.id,
      mode: "monitor_unit",
      editor: v_editor,
      editor_data: v_editor_data,
      editorDataDiv: v_txt_data,
      select_type: document.getElementById("select_type_" + v_tab.id),
      select_chart_type: v_select_chart_type,
      select_template: document.getElementById("select_template_" + v_tab.id),
      input_unit_name: document.getElementById("txt_unit_name_" + v_tab.id),
      input_interval: document.getElementById("txt_interval_" + v_tab.id),
      div_result: document.getElementById("monitoring_unit_test_result"),
      div_result_label: document.getElementById("monitoring_unit_test_legend"),
      bt_test: document.getElementById("bt_test_" + v_tab.id),
      tabControl: v_connTabControl.selectedTab.tag.tabControl,
      unit_id: null,
      object: null,
      resize: v_resizeFunction,
      tabCloseFunction: function(p_tag) {
        try {
          p_tag.object.destroy();
        } catch (err) {
        }
      }
    };
    toggleMonitorUnitChartType(v_tab.id);
    v_tab.tag = v_tag;
    var v_add_tab = v_connTabControl.selectedTab.tag.tabControl.createTab({
      p_name: "+",
      p_close: false,
      p_selectable: false,
      p_clickFunction: function(e) {
        showMenuNewTab(e);
      }
    });
    v_add_tab.tag = {
      mode: "add"
    };
    setTimeout(function() {
      v_resizeFunction();
    }, 10);
  };
  function toggleMonitorUnitChartType(p_tab_id) {
    var v_row = document.getElementById("chart_type_row_" + p_tab_id);
    var v_type_select = document.getElementById("select_type_" + p_tab_id);
    if (!v_row || !v_type_select) return;
    v_row.style.display = v_type_select.value == "chart" ? "" : "none";
  }
  const innerMonitoringDashboardTab = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    toggleMonitorUnitChartType,
    v_createMonitorDashboardTabFunction,
    v_createNewMonitorUnitTabFunction
  }, Symbol.toStringTag, { value: "Module" }));
  var v_createMonitoringTabFunction = function(p_name, p_query, p_actions) {
    var v_name = "Backends";
    if (p_name) v_name = p_name;
    v_connTabControl.selectedTab.tag.tabControl.removeLastTab();
    var v_tab = v_connTabControl.selectedTab.tag.tabControl.createTab({
      p_icon: `<i class="fas fa-desktop icon-tab-title"></i>`,
      p_name: '<span id="tab_title">' + v_name + '</span><span id="tab_loading" style="visibility:hidden;"><i class="tab-icon node-spin"></i></span><i title="" id="tab_check" style="display: none;" class="fas fa-check-circle tab-icon icon-check"></i>',
      p_selectFunction: function() {
        document.title = "OmniDB";
        if (this.tag != null) {
          this.tag.resize();
        }
      },
      p_closeFunction: function(e, p_tab) {
        var v_current_tab = p_tab;
        beforeCloseTab(e, function() {
          removeTab(v_current_tab);
        });
      },
      p_dblClickFunction: renameTab
    });
    v_connTabControl.selectedTab.tag.tabControl.selectTab(v_tab);
    var v_tab_title_span = document.getElementById("tab_title");
    v_tab_title_span.id = "tab_title_" + v_tab.id;
    var v_tab_loading_span = document.getElementById("tab_loading");
    v_tab_loading_span.id = "tab_loading_" + v_tab.id;
    var v_tab_check_span = document.getElementById("tab_check");
    v_tab_check_span.id = "tab_check_" + v_tab.id;
    var v_html = "<div class='p-2 omnidb__theme-border--primary'><button id='bt_refresh_" + v_tab.id + "' class='btn omnidb__theme__btn--primary btn-sm my-2 mr-1' title='Refresh'><i class='fas fa-sync-alt mr-2'></i>Refresh</button><span id='div_query_info_" + v_tab.id + "' class='query_info'></span><div id='div_result_" + v_tab.id + "' class='omnidb__query-result-tabs__content' style='width: 100%; overflow: auto;'></div>";
    v_tab.elementDiv.innerHTML = v_html;
    var v_bt_refresh = document.getElementById("bt_refresh_" + v_tab.id);
    var v_resizeFunction = function() {
      var v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;
      if (v_tab_tag.div_result) {
        v_tab_tag.div_result.style.height = window.innerHeight - $(v_tab_tag.div_result).offset().top - 1.25 * v_font_size + "px";
        setTimeout(function() {
          if (v_tab_tag.ht != null) {
            v_tab_tag.ht.render();
          }
        }, 400);
      }
    };
    var v_tag = {
      tab_id: v_tab.id,
      tabTitle: "teste",
      divTree: document.getElementById(v_tab.id + "_tree"),
      divLeft: document.getElementById(v_tab.id + "_div_left"),
      divRight: document.getElementById(v_tab.id + "_div_right"),
      // tab_title_span : v_tab_title_span,
      // tab_close_span : v_tab_close_span,
      query_info: document.getElementById("div_query_info_" + v_tab.id),
      div_result: document.getElementById("div_result_" + v_tab.id),
      bt_refresh: v_bt_refresh,
      tabControl: v_connTabControl.selectedTab.tag.tabControl,
      ht: null,
      query: p_query,
      actions: p_actions,
      mode: "monitor_grid",
      resize: v_resizeFunction
    };
    v_bt_refresh.onclick = function() {
      refreshMonitoring$1(v_tag);
    };
    v_tab.tag = v_tag;
    var v_add_tab = v_connTabControl.selectedTab.tag.tabControl.createTab({
      p_name: "+",
      p_close: false,
      p_selectable: false,
      p_clickFunction: function(e) {
        showMenuNewTab(e);
      }
    });
    v_add_tab.tag = {
      mode: "add"
    };
    setTimeout(function() {
      v_resizeFunction();
      refreshMonitoring$1(v_tag);
    }, 10);
  };
  function refreshMonitoring$1(p_tab_tag) {
    if (!p_tab_tag) var p_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;
    execAjax(
      "/refresh_monitoring/",
      JSON.stringify({
        p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
        p_tab_id: v_connTabControl.selectedTab.id,
        p_query: p_tab_tag.query
      }),
      function(p_return) {
        var v_data = p_return.v_data;
        if (p_tab_tag.ht != null) {
          p_tab_tag.ht.destroy();
          p_tab_tag.ht = null;
        }
        p_tab_tag.query_info.innerHTML = v_data.v_query_info;
        var columnProperties = [];
        var v_fixedColumnsLeft = 0;
        if (p_tab_tag.actions != null) {
          v_fixedColumnsLeft = 1;
          for (var i2 = 0; i2 < v_data.v_data.length; i2++) {
            var v_actions_html = "";
            for (var j2 = 0; j2 < p_tab_tag.actions.length; j2++) {
              if (p_tab_tag.actions[j2].icon.includes("fa-times")) {
                p_tab_tag.actions[j2].icon += " text-danger";
              } else {
                p_tab_tag.actions[j2].icon += " omnidb__theme-text--primary";
              }
              v_actions_html += '<div class="text-center"><i class="' + p_tab_tag.actions[j2].icon + '" onclick="monitoringAction(' + i2 + ",&apos;" + p_tab_tag.actions[j2].action + '&apos;)"></div>';
            }
            v_data.v_data[i2].unshift(v_actions_html);
          }
          var col = new Object();
          col.readOnly = true;
          col.title = "Actions";
          col.renderer = "html";
          columnProperties.push(col);
        }
        for (var i2 = 0; i2 < v_data.v_col_names.length; i2++) {
          var col = new Object();
          col.readOnly = true;
          col.title = v_data.v_col_names[i2];
          columnProperties.push(col);
        }
        p_tab_tag.ht = new Handsontable(p_tab_tag.div_result, {
          licenseKey: "non-commercial-and-evaluation",
          data: v_data.v_data,
          columns: columnProperties,
          colHeaders: true,
          rowHeaders: true,
          fixedColumnsLeft: v_fixedColumnsLeft,
          fillHandle: false,
          //copyRowsLimit : 1000000000,
          //copyColsLimit : 1000000000,
          copyPaste: { pasteMode: "", rowsLimit: 1e9, columnsLimit: 1e9 },
          manualColumnResize: true,
          contextMenu: {
            callback: function(key, options) {
              if (key === "view_data") {
                editCellData(
                  this,
                  options[0].start.row,
                  options[0].start.col,
                  this.getDataAtCell(options[0].start.row, options[0].start.col),
                  false
                );
              } else if (key === "copy") {
                this.selectCell(options[0].start.row, options[0].start.col, options[0].end.row, options[0].end.col);
                document.execCommand("copy");
              }
            },
            items: {
              copy: {
                name: '<div style="position: absolute;"><i class="fas fa-copy cm-all" style="vertical-align: middle;"></i></div><div style="padding-left: 30px;">Copy</div>'
              },
              view_data: {
                name: '<div style="position: absolute;"><i class="fas fa-edit cm-all" style="vertical-align: middle;"></i></div><div style="padding-left: 30px;">View Content</div>'
              }
            }
          },
          cells: function(row, col2, prop) {
            var cellProperties = {};
            if (row % 2 == 0) cellProperties.renderer = blueHtmlRenderer;
            else cellProperties.renderer = whiteHtmlRenderer;
            return cellProperties;
          }
        });
      },
      function(p_return) {
        if (p_return.v_data.password_timeout) {
          showPasswordPrompt(
            v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
            function() {
              refreshMonitoring$1(p_tab_tag);
            },
            null,
            p_return.v_data.message
          );
        } else {
          showError(p_return.v_data);
        }
      },
      "box",
      true
    );
  }
  const innerMonitoringTab = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    refreshMonitoring: refreshMonitoring$1,
    v_createMonitoringTabFunction
  }, Symbol.toStringTag, { value: "Module" }));
  var v_openExternalUrl = function(p_url) {
    if (!gv_desktopMode) {
      window.open(p_url, "_blank", "noopener");
      return;
    }
    fetch("/open_external_url/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: p_url })
    }).then(function(p_response) {
      return p_response.json();
    }).then(function(p_result) {
      if (p_result && p_result.error) {
        showAlert("Error opening link: " + p_result.error);
      }
    }).catch(function() {
      showAlert("Error opening link.");
    });
  };
  var v_createWebsiteTabFunction = function(p_name, p_site) {
    v_openExternalUrl(p_site);
  };
  var v_createWebsiteOuterTabFunction = function(p_name, p_site, p_html, p_close_function) {
    if (p_html == null) {
      v_openExternalUrl(p_site);
      return;
    }
    v_connTabControl.removeLastTab();
    var v_tab = v_connTabControl.createTab({
      p_name: '<i class="fas fa-globe-americas icon-tab-title"></i><span id="tab_title"> ' + p_name + "</span>",
      p_selectFunction: function() {
        if (this.tag != null) {
          this.tag.resize();
        }
      },
      p_closeFunction: function(e, p_tab) {
        var v_current_tab = p_tab;
        beforeCloseTab(e, function() {
          if (p_close_function != null) {
            p_close_function();
          }
          removeTab(v_current_tab);
        });
      },
      p_dblClickFunction: renameTab
    });
    v_connTabControl.selectTab(v_tab);
    var v_html = "<div id='website_" + v_tab.id + "' style=' width: 100%; height: 200px;'>" + p_html + "</div>";
    var v_div = document.getElementById("div_" + v_tab.id);
    v_div.innerHTML = v_html;
    var v_resizeFunction = function() {
      var v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;
      if (v_tab_tag.iframe) {
        v_tab_tag.iframe.style.height = window.innerHeight - $(v_tab_tag.iframe).offset().top - 0.833 * v_font_size + "px";
      }
    };
    var v_tag = {
      tab_id: v_tab.id,
      mode: "website_outer",
      iframe: document.getElementById("website_" + v_tab.id),
      tabControl: v_connTabControl,
      resize: v_resizeFunction
    };
    v_tab.tag = v_tag;
    v_connTabControl.createTab({
      p_name: "+",
      p_close: false,
      p_selectable: false,
      p_clickFunction: function(e) {
        showMenuNewTabOuter(e);
      }
    });
    setTimeout(function() {
      v_resizeFunction();
    }, 10);
  };
  const websiteTab = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    v_createWebsiteOuterTabFunction,
    v_createWebsiteTabFunction,
    v_openExternalUrl
  }, Symbol.toStringTag, { value: "Module" }));
  exposeGlobals(
    treeSnippets,
    treePostgresql,
    treeOracle,
    treeMariadb,
    treeMysql,
    treeSqlite,
    renderers,
    headerActions,
    query,
    customMenu$2,
    notificationControl,
    outerSnippetPanel,
    passwords,
    properties,
    tabs,
    outerConnectionTab,
    outerTerminalTab,
    outerWelcomeTab,
    innerEditDataTab,
    innerGraphTab,
    innerSnippetTab,
    innerQueryTab,
    innerConsoleTab,
    innerMonitoringDashboardTab,
    innerMonitoringTab,
    websiteTab
  );
})();
//# sourceMappingURL=omnidb.bundle.js.map
