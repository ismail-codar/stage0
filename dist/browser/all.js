var stage0 = (function (exports) {
  'use strict';

  function collector(node) {
    if (node.nodeType !== 3) {
      if (node.attributes !== undefined) {
        for(let attr of node.attributes) {
          let aname = attr.name;
          if (aname[0] === '#') {
            node.removeAttribute(aname);
            return aname.slice(1)
          }
        }
      }
      return 0
    } else {
      let nodeData = node.nodeValue;
      if (nodeData[0] === '#') {
        node.nodeValue = "";
        return nodeData.slice(1)
      }
      return 0
    }
  }

  const TREE_WALKER = document.createTreeWalker(document, NodeFilter.SHOW_ALL, null, false);
  TREE_WALKER.roll = function(n) {
    let tmp;
    while(--n) tmp = this.nextNode();
    return tmp
  };

  class Ref {
    constructor(idx, ref) {
      this.idx = idx;
      this.ref = ref;
    }
  }

  function genPath(node) {
    const w = TREE_WALKER;
    w.currentNode = node;

    let indices = [], ref, idx = 0;
    do {
      if (ref = collector(node)) {
        indices.push(new Ref(idx+1, ref));
        idx = 1;
      } else {
        idx++;  
      }
    } while(node = w.nextNode())

    return indices
  }

  function walker(node) {
    const refs = {};

    const w = TREE_WALKER;
    w.currentNode = node;

    this._refPaths.map(x => refs[x.ref] = w.roll(x.idx));

    return refs
  }

  const compilerTemplate = document.createElement('template');
  function h(strings, ...args) {
    let result = '';
    for(let i = 0; i < args.length; i++) result += strings[i] + args[i];
    result += strings[strings.length - 1];

    const template = result
      .replace(/>\n+/g, '>')
      .replace(/\s+</g, '<')
      .replace(/>\s+/g, '>')
      .replace(/\n\s+/g, '<!-- -->');
    compilerTemplate.innerHTML = template;
    const content = compilerTemplate.content.firstChild;
    content._refPaths = genPath(content);
    content.collect = walker;
    return content
  }

  // This is almost straightforward implementation of reconcillation algorithm
  // based on ivi documentation:
  // https://github.com/localvoid/ivi/blob/2c81ead934b9128e092cc2a5ef2d3cabc73cb5dd/packages/ivi/src/vdom/implementation.ts#L1366
  // With some fast paths from Surplus implementation:
  // https://github.com/adamhaile/surplus/blob/master/src/runtime/content.ts#L86
  //
  // How this implementation differs from others, is that it's working with data directly,
  // without maintaining nodes arrays, and uses dom props firstChild/lastChild/nextSibling
  // for markers moving.
  function keyed(key, parent, renderedValues, data, createFn, noOp, beforeNode, afterNode) {
      // Fast path for clear
      if (data.length === 0) {
          if (beforeNode !== undefined || afterNode !== undefined) {
              let node = beforeNode !== undefined ? beforeNode.nextSibling : parent.firstChild,
                  tmp;

              if (afterNode === undefined) afterNode = null;

              while(node !== afterNode) {
                  tmp = node.nextSibling;
                  parent.removeChild(node);
                  node = tmp;
              }
          } else {
              parent.textContent = "";    
          }
          return
      }

      // Fast path for create
      if (renderedValues.length === 0) {
          let node, mode = afterNode !== undefined ? 1 : 0;
          for(let i = 0, len = data.length; i < len; i++) {
              node = createFn(data[i]);
              mode ? parent.insertBefore(node, afterNode) : parent.appendChild(node);
          }
          return
      }

      let prevStart = 0,
          newStart = 0,
          loop = true,
          prevEnd = renderedValues.length-1, newEnd = data.length-1,
          a, b,
          prevStartNode = beforeNode ? beforeNode.nextSibling : parent.firstChild,
          newStartNode = prevStartNode,
          prevEndNode = afterNode ? afterNode.previousSibling : parent.lastChild,
          newEndNode = prevEndNode;
      
      fixes: while(loop) {
          loop = false;
          let _node;

          // Skip prefix
          a = renderedValues[prevStart], b = data[newStart];
          while(a[key] === b[key]) {
              noOp(prevStartNode, b);
              prevStart++;
              newStart++;
              newStartNode = prevStartNode = prevStartNode.nextSibling;
              if (prevEnd < prevStart || newEnd < newStart) break fixes
              a = renderedValues[prevStart];
              b = data[newStart];
          }

          // Skip suffix
          a = renderedValues[prevEnd], b = data[newEnd];
          while(a[key] === b[key]) {
              noOp(prevEndNode, b);
              prevEnd--;
              newEnd--;
              afterNode = prevEndNode;
              newEndNode = prevEndNode = prevEndNode.previousSibling;
              if (prevEnd < prevStart || newEnd < newStart) break fixes
              a = renderedValues[prevEnd];
              b = data[newEnd];
          }

          // Fast path to swap backward
          a = renderedValues[prevEnd], b = data[newStart];
          while(a[key] === b[key]) {
              loop = true;
              noOp(prevEndNode, b);
              _node = prevEndNode.previousSibling;
              parent.insertBefore(prevEndNode, newStartNode);
              newEndNode = prevEndNode = _node;
              newStart++;
              prevEnd--;
              if (prevEnd < prevStart || newEnd < newStart) break fixes
              a = renderedValues[prevEnd];
              b = data[newStart];
          }

          // Fast path to swap forward
          a = renderedValues[prevStart], b = data[newEnd];
          while(a[key] === b[key]) {
              loop = true;
              noOp(prevStartNode, b);
              _node = prevStartNode.nextSibling;
              parent.insertBefore(prevStartNode, afterNode);
              prevStart++;
              afterNode = newEndNode = prevStartNode;
              prevStartNode = _node;
              newEnd--;
              if (prevEnd < prevStart || newEnd < newStart) break fixes
              a = renderedValues[prevStart];
              b = data[newEnd];
          }
      }

      // Fast path for shrink
      if (newEnd < newStart) {
          if (prevStart <= prevEnd) {
              let next;
              while(prevStart <= prevEnd) {
                  if (prevEnd === 0) {
                      parent.removeChild(prevEndNode);
                  } else {
                      next = prevEndNode.previousSibling;    
                      parent.removeChild(prevEndNode);
                      prevEndNode = next;
                  }
                  prevEnd--;
              }
          }
          return
      }

      // Fast path for add
      if (prevEnd < prevStart) {
          if (newStart <= newEnd) {
              let node, mode = afterNode ? 1 : 0;
              while(newStart <= newEnd) {
                  node = createFn(data[newStart]);
                  mode ? parent.insertBefore(node, afterNode) : parent.appendChild(node);
                  newStart++;
              }
          }
          return
      }

      // Positions for reusing nodes from current DOM state
      const P = new Array(newEnd + 1 - newStart);
      for(let i = newStart; i <= newEnd; i++) P[i] = -1;

      // Index to resolve position from current to new
      const I = new Map();
      for(let i = newStart; i <= newEnd; i++) I.set(data[i][key], i);

      let reusingNodes = 0, toRemove = [];
      for(let i = prevStart; i <= prevEnd; i++) {
          if (I.has(renderedValues[i][key])) {
              P[I.get(renderedValues[i][key])] = i;
              reusingNodes++;
          } else {
              toRemove.push(i);
          }
      }

      // Fast path for full replace
      if (reusingNodes === 0) {
          if (beforeNode !== undefined || afterNode !== undefined) {
              let node = beforeNode !== undefined ? beforeNode.nextSibling : parent.firstChild,
                  tmp;

              if (afterNode === undefined) afterNode = null;

              while(node !== afterNode) {
                  tmp = node.nextSibling;
                  parent.removeChild(node);
                  node = tmp;
                  prevStart++;
              }
          } else {
              parent.textContent = "";
          }

          let node, mode = afterNode ? 1 : 0;
          for(let i = newStart; i <= newEnd; i++) {
              node = createFn(data[i]);
              mode ? parent.insertBefore(node, afterNode) : parent.appendChild(node);
          }

          return
      }

      // What else?
      const longestSeq = longestPositiveIncreasingSubsequence(P, newStart);

      // Collect nodes to work with them
      const nodes = [];
      let tmpC = prevStartNode;
      for(let i = prevStart; i <= prevEnd; i++) {
          nodes[i] = tmpC;
          tmpC = tmpC.nextSibling;
      }

      for(let i = 0; i < toRemove.length; i++) parent.removeChild(nodes[toRemove[i]]);

      let lisIdx = longestSeq.length - 1, tmpD;
      for(let i = newEnd; i >= newStart; i--) {
          if(longestSeq[lisIdx] === i) {
              afterNode = nodes[P[longestSeq[lisIdx]]];
              noOp(afterNode, data[i]);
              lisIdx--;
          } else {
              if (P[i] === -1) {
                  tmpD = createFn(data[i]);
              } else {
                  tmpD = nodes[P[i]];
                  noOp(tmpD, data[i]);
              }
              parent.insertBefore(tmpD, afterNode);
              afterNode = tmpD;
          }
      }
  }

  // Picked from
  // https://github.com/adamhaile/surplus/blob/master/src/runtime/content.ts#L368

  // return an array of the indices of ns that comprise the longest increasing subsequence within ns
  function longestPositiveIncreasingSubsequence(ns, newStart) {
      var seq = [],
          is  = [],
          l   = -1,
          pre = new Array(ns.length);

      for (var i = newStart, len = ns.length; i < len; i++) {
          var n = ns[i];
          if (n < 0) continue;
          var j = findGreatestIndexLEQ(seq, n);
          if (j !== -1) pre[i] = is[j];
          if (j === l) {
              l++;
              seq[l] = n;
              is[l]  = i;
          } else if (n < seq[j + 1]) {
              seq[j + 1] = n;
              is[j + 1] = i;
          }
      }

      for (i = is[l]; l >= 0; i = pre[i], l--) {
          seq[l] = i;
      }

      return seq;
  }

  function findGreatestIndexLEQ(seq, n) {
      // invariant: lo is guaranteed to be index of a value <= n, hi to be >
      // therefore, they actually start out of range: (-1, last + 1)
      var lo = -1,
          hi = seq.length;
      
      // fast path for simple increasing sequences
      if (hi > 0 && seq[hi - 1] <= n) return hi - 1;

      while (hi - lo > 1) {
          var mid = Math.floor((lo + hi) / 2);
          if (seq[mid] > n) {
              hi = mid;
          } else {
              lo = mid;
          }
      }

      return lo;
  }

  // This is almost straightforward implementation of reconcillation algorithm
  // based on ivi documentation:
  // https://github.com/localvoid/ivi/blob/2c81ead934b9128e092cc2a5ef2d3cabc73cb5dd/packages/ivi/src/vdom/implementation.ts#L1366
  // With some fast paths from Surplus implementation:
  // https://github.com/adamhaile/surplus/blob/master/src/runtime/content.ts#L86
  //
  // How this implementation differs from others, is that it's working with data directly,
  // without maintaining nodes arrays, and uses dom props firstChild/lastChild/nextSibling
  // for markers moving.
  function reconcile(parent, renderedValues, data, createFn, noOp, beforeNode, afterNode) {
      // Fast path for clear
      if (data.length === 0) {
          if (beforeNode !== undefined || afterNode !== undefined) {
              let node = beforeNode !== undefined ? beforeNode.nextSibling : parent.firstChild,
                  tmp;

              if (afterNode === undefined) afterNode = null;

              while(node !== afterNode) {
                  tmp = node.nextSibling;
                  parent.removeChild(node);
                  node = tmp;
              }
          } else {
              parent.textContent = "";    
          }
          return
      }

      // Fast path for create
      if (renderedValues.length === 0) {
          let node, mode = afterNode !== undefined ? 1 : 0;
          for(let i = 0, len = data.length; i < len; i++) {
              node = createFn(data[i]);
              mode ? parent.insertBefore(node, afterNode) : parent.appendChild(node);
          }
          return
      }

      let prevStart = 0,
          newStart = 0,
          loop = true,
          prevEnd = renderedValues.length-1, newEnd = data.length-1,
          a, b,
          prevStartNode = beforeNode ? beforeNode.nextSibling : parent.firstChild,
          newStartNode = prevStartNode,
          prevEndNode = afterNode ? afterNode.previousSibling : parent.lastChild,
          newEndNode = prevEndNode;
      
      fixes: while(loop) {
          loop = false;
          let _node;

          // Skip prefix
          a = renderedValues[prevStart], b = data[newStart];
          while(a === b) {
              noOp(prevStartNode, b);
              prevStart++;
              newStart++;
              newStartNode = prevStartNode = prevStartNode.nextSibling;
              if (prevEnd < prevStart || newEnd < newStart) break fixes
              a = renderedValues[prevStart];
              b = data[newStart];
          }

          // Skip suffix
          a = renderedValues[prevEnd], b = data[newEnd];
          while(a === b) {
              noOp(prevEndNode, b);
              prevEnd--;
              newEnd--;
              afterNode = prevEndNode;
              newEndNode = prevEndNode = prevEndNode.previousSibling;
              if (prevEnd < prevStart || newEnd < newStart) break fixes
              a = renderedValues[prevEnd];
              b = data[newEnd];
          }

          // Fast path to swap backward
          a = renderedValues[prevEnd], b = data[newStart];
          while(a === b) {
              loop = true;
              noOp(prevEndNode, b);
              _node = prevEndNode.previousSibling;
              parent.insertBefore(prevEndNode, newStartNode);
              newEndNode = prevEndNode = _node;
              newStart++;
              prevEnd--;
              if (prevEnd < prevStart || newEnd < newStart) break fixes
              a = renderedValues[prevEnd];
              b = data[newStart];
          }

          // Fast path to swap forward
          a = renderedValues[prevStart], b = data[newEnd];
          while(a === b) {
              loop = true;
              noOp(prevStartNode, b);
              _node = prevStartNode.nextSibling;
              parent.insertBefore(prevStartNode, afterNode);
              prevStart++;
              afterNode = newEndNode = prevStartNode;
              prevStartNode = _node;
              newEnd--;
              if (prevEnd < prevStart || newEnd < newStart) break fixes
              a = renderedValues[prevStart];
              b = data[newEnd];
          }
      }

      // Fast path for shrink
      if (newEnd < newStart) {
          if (prevStart <= prevEnd) {
              let next;
              while(prevStart <= prevEnd) {
                  if (prevEnd === 0) {
                      parent.removeChild(prevEndNode);
                  } else {
                      next = prevEndNode.previousSibling;    
                      parent.removeChild(prevEndNode);
                      prevEndNode = next;
                  }
                  prevEnd--;
              }
          }
          return
      }

      // Fast path for add
      if (prevEnd < prevStart) {
          if (newStart <= newEnd) {
              let node, mode = afterNode ? 1 : 0;
              while(newStart <= newEnd) {
                  node = createFn(data[newStart]);
                  mode ? parent.insertBefore(node, afterNode) : parent.appendChild(node);
                  newStart++;
              }
          }
          return
      }

      // Positions for reusing nodes from current DOM state
      const P = new Array(newEnd + 1 - newStart);
      for(let i = newStart; i <= newEnd; i++) P[i] = -1;

      // Index to resolve position from current to new
      const I = new Map();
      for(let i = newStart; i <= newEnd; i++) I.set(data[i], i);

      let reusingNodes = 0, toRemove = [];
      for(let i = prevStart; i <= prevEnd; i++) {
          if (I.has(renderedValues[i])) {
              P[I.get(renderedValues[i])] = i;
              reusingNodes++;
          } else {
              toRemove.push(i);
          }
      }

      // Fast path for full replace
      if (reusingNodes === 0) {
          if (beforeNode !== undefined || afterNode !== undefined) {
              let node = beforeNode !== undefined ? beforeNode.nextSibling : parent.firstChild,
                  tmp;

              if (afterNode === undefined) afterNode = null;

              while(node !== afterNode) {
                  tmp = node.nextSibling;
                  parent.removeChild(node);
                  node = tmp;
                  prevStart++;
              }
          } else {
              parent.textContent = "";
          }

          let node, mode = afterNode ? 1 : 0;
          for(let i = newStart; i <= newEnd; i++) {
              node = createFn(data[i]);
              mode ? parent.insertBefore(node, afterNode) : parent.appendChild(node);
          }

          return
      }

      // What else?
      const longestSeq = longestPositiveIncreasingSubsequence$1(P, newStart);

      // Collect nodes to work with them
      const nodes = [];
      let tmpC = prevStartNode;
      for(let i = prevStart; i <= prevEnd; i++) {
          nodes[i] = tmpC;
          tmpC = tmpC.nextSibling;
      }

      for(let i = 0; i < toRemove.length; i++) parent.removeChild(nodes[toRemove[i]]);

      let lisIdx = longestSeq.length - 1, tmpD;
      for(let i = newEnd; i >= newStart; i--) {
          if(longestSeq[lisIdx] === i) {
              afterNode = nodes[P[longestSeq[lisIdx]]];
              noOp(afterNode, data[i]);
              lisIdx--;
          } else {
              if (P[i] === -1) {
                  tmpD = createFn(data[i]);
              } else {
                  tmpD = nodes[P[i]];
                  noOp(tmpD, data[i]);
              }
              parent.insertBefore(tmpD, afterNode);
              afterNode = tmpD;
          }
      }
  }

  // Picked from
  // https://github.com/adamhaile/surplus/blob/master/src/runtime/content.ts#L368

  // return an array of the indices of ns that comprise the longest increasing subsequence within ns
  function longestPositiveIncreasingSubsequence$1(ns, newStart) {
      var seq = [],
          is  = [],
          l   = -1,
          pre = new Array(ns.length);

      for (var i = newStart, len = ns.length; i < len; i++) {
          var n = ns[i];
          if (n < 0) continue;
          var j = findGreatestIndexLEQ$1(seq, n);
          if (j !== -1) pre[i] = is[j];
          if (j === l) {
              l++;
              seq[l] = n;
              is[l]  = i;
          } else if (n < seq[j + 1]) {
              seq[j + 1] = n;
              is[j + 1] = i;
          }
      }

      for (i = is[l]; l >= 0; i = pre[i], l--) {
          seq[l] = i;
      }

      return seq;
  }

  function findGreatestIndexLEQ$1(seq, n) {
      // invariant: lo is guaranteed to be index of a value <= n, hi to be >
      // therefore, they actually start out of range: (-1, last + 1)
      var lo = -1,
          hi = seq.length;
      
      // fast path for simple increasing sequences
      if (hi > 0 && seq[hi - 1] <= n) return hi - 1;

      while (hi - lo > 1) {
          var mid = Math.floor((lo + hi) / 2);
          if (seq[mid] > n) {
              hi = mid;
          } else {
              lo = mid;
          }
      }

      return lo;
  }

  function reuseNodes(parent, renderedValues, data, createFn, noOp, beforeNode, afterNode) {
      if (data.length === 0) {
          if (beforeNode !== undefined || afterNode !== undefined) {
              let node = beforeNode !== undefined ? beforeNode.nextSibling : parent.firstChild,
                  tmp;

              if (afterNode === undefined) afterNode = null;

              while(node !== afterNode) {
                  tmp = node.nextSibling;
                  parent.removeChild(node);
                  node = tmp;
              }
          } else {
              parent.textContent = "";    
          }
          return
      }
      if (renderedValues.length > data.length) {
          let i = renderedValues.length,
              tail = afterNode !== undefined ? afterNode.previousSibling : parent.lastChild,
              tmp;
          while(i > data.length) {
              tmp = tail.previousSibling;
              parent.removeChild(tail);
              tail = tmp;
              i--;
          }
      }

      let _head = beforeNode ? beforeNode.nextSibling : parent.firstChild;
      if (_head === afterNode) _head = undefined;

      let _mode = afterNode ? 1 : 0;
      for(let i = 0, item, head = _head, mode = _mode; i < data.length; i++) {
          item = data[i];
          if (head) {
              noOp(head, item);
          } else {
              head = createFn(item);
              mode ? parent.insertBefore(head, afterNode) : parent.appendChild(head);
          }
          head = head.nextSibling;
          if (head === afterNode) head = null;
      }
  }

  function makeid() {
      const {possible, n} = makeid;
      let alphaHex = n.toString(26).split(''), c, r = '';
      while(c = alphaHex.shift()) r += possible[parseInt(c, 26)];
      makeid.n++;
      return r
  }
  makeid.possible = "abcdefghijklmnopqrstuvwxyz";
  makeid.n = 0;

  let stylesheet = document.createElement('style');
  stylesheet.id = 'stage0';
  document.head.appendChild(stylesheet);
  stylesheet = stylesheet.sheet;

  function styles(stylesObj) {
      for(let className in stylesObj) {
          const genClass = `${className}-${makeid()}`;
          
          const ruleIdx = stylesheet.insertRule(`.${genClass} {}`, stylesheet.cssRules.length);
          const ruleStyle = stylesheet.cssRules[ruleIdx].style;
          
          const classStyles = stylesObj[className];

          for(let rule in classStyles) {
              if (rule[0] === ':' || rule[0] === ' ') {
                  const pseudoRuleIdx = stylesheet.insertRule(`.${genClass}${rule} {}`, stylesheet.cssRules.length);
                  const pseudoRuleStyle = stylesheet.cssRules[pseudoRuleIdx].style;
                  Object.assign(pseudoRuleStyle, classStyles[rule]);
                  delete classStyles[rule];
              }
          }
          
          Object.assign(ruleStyle, classStyles);
          
          stylesObj[className] = genClass;
      }

      return stylesObj
  }

  const nativeToSyntheticEvent = (event, name) => {
      const eventKey = `__${name}`;
      let dom = event.target;
      while(dom !== null) {
          const eventHandler = dom[eventKey];
          if (eventHandler) {
              eventHandler();
              return
          }
          dom = dom.parentNode;
      }
  };
  const CONFIGURED_SYNTHETIC_EVENTS = {};
  function setupSyntheticEvent(name) {
      if (CONFIGURED_SYNTHETIC_EVENTS[name]) return
      document.addEventListener(name, event => nativeToSyntheticEvent(event, name));
      CONFIGURED_SYNTHETIC_EVENTS[name] = true;
  }

  exports.html = h;
  exports.keyed = keyed;
  exports.reconcile = reconcile;
  exports.reuseNodes = reuseNodes;
  exports.styles = styles;
  exports.setupSyntheticEvent = setupSyntheticEvent;

  return exports;

}({}));
