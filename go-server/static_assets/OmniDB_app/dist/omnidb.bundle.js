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
  function getTreeSnippets(p_div) {
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
        buildSnippetContextMenuObjects(
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
  function buildSnippetContextMenuObjects(p_mode, p_object, p_editor, p_callback) {
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
            elements: buildSnippetContextMenuObjects(p_mode, v_folder, p_editor, p_callback)
          }
        });
      })(i2);
    return v_elements;
  }
  const treeSnippets = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    buildSnippetContextMenuObjects,
    closeSnippetTab,
    deleteNodeSnippet,
    executeSnippet,
    getAllSnippets,
    getChildSnippetNodes,
    getTreeSnippets,
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
  exposeGlobals(
    treeSnippets,
    treePostgresql,
    treeOracle,
    treeMariadb,
    treeMysql
  );
})();
//# sourceMappingURL=omnidb.bundle.js.map
