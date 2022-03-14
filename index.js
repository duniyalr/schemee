const cheerio = require("cheerio");
const cheerioGetUniqueSelector = require('cheerio-get-css-selector');
const helpers = require("./helpers");
const { SYMBOL, TYPE } = require("./config");
const { last } = require("cheerio/lib/api/traversing");
/**
 * scans the input and makes token from them;
 * @param {String} name 
 * @param {String} input 
 */
function blueprint(name, input) {
  const tokens = __tokenize(input);
  const formatedInput = __format(input, tokens);
  const treeRoot = __tree(tokens, formatedInput);
  this.blueprints[name] = {
    treeRoot
  }
}

/**
 * scans for tokens;
 * @param {String} input 
 * @return {Array[__token]}
 */
function __tokenize(input) {
  const T_START = '{';
  const T_END = '}';

  const tokens = [new __token(":ROOT")];
  let pos = 0;
  while(true) {
    const tsPos = input.indexOf(T_START, pos);
    if (tsPos === -1) break;
    const tePos = input.indexOf(T_END, tsPos + T_START.length);
    if (tePos === -1) throw "end of token not found";

    const tString = input.substring(tsPos + T_START.length, tePos);
    const token = new __token(tString, tsPos, tePos);
    tokens.push(token);
    pos = tsPos + T_END.length;
  }

  return tokens;
}

/**
 * generates token from tokenString;
 * @param {String} tString 
 * @param {Number} tsPos 
 * @param {Number} tePos 
 */
function __token(tString, tsPos, tePos) {
  const TS_REGEX = /^(?<type>(\:\:)|(\:)|(\$))(?<name>[\.\w]+)?$/;
  const parsedTString = TS_REGEX.exec(tString);
  if (!parsedTString) return false;

  this.name = parsedTString.groups.name;
  this.type = parsedTString.groups.type + (this.name ? "" : ">");
  this.tsPos = tsPos;
  this.tePos = tePos;
  if (this.type === TYPE.LIST) {
    this.items = [];
  } else if (this.type === TYPE.DICT) {
    this.items = []; //{};
  }

  if (
    this.type !== SYMBOL.DICT_END &&
    this.type !== SYMBOL.LIST_END
  ) {
    this.id = helpers.generateId();
  }
}

/**
 * makes a tree from tokens list;
 * @param {Array[__token]} tokens 
 * @param {String} formatedInput
 */
function __tree(tokens, formatedInput) {
  const $ = cheerio.load(formatedInput);
  cheerioGetUniqueSelector.init($);

  let treePath = [tokens[0]];
  let activeParent = tokens[0]
  let activeToken = tokens[1];

  for (i = 1; i < tokens.length; i++) {
    activeToken = tokens[i];
    if (!activeToken) break;

    if (
      activeToken.type === SYMBOL.LIST_END ||
      activeToken.type === SYMBOL.DICT_END
    ) {
      treePath.pop();
      if (!treePath.length) throw "no parent remained";
      activeParent = treePath[treePath.length - 1];
      continue;
    }

    if (activeParent.type === TYPE.DICT) {
      activeParent.items.push(activeToken);
    } else {
      activeParent.items.push(activeToken);
      // pathIndex[pathIndex.length - 1]++;
    }

    __attachSelector($, activeToken, activeParent)

    if (activeToken.type === TYPE.LIST) {
      activeParent = activeToken;
      treePath.push(activeToken);
      // pathIndex.push(0);
    } else if (activeToken.type === TYPE.DICT) {
      activeParent = activeToken;
      treePath.push(activeToken);
    }

  }

  return tokens[0];
} 

/**
 * replaces tStrings with real schemee html elements;
 * @param {String} input 
 * @param {Array[__token]} tokens 
 */
function __format(input, tokens){
  const parts = [];

  let prevTEPos = 0;
  // first element is ROOT;
  for(let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    const htmlElement = tokenToHtmlElement(token);
    parts.push(input.substring(prevTEPos, token.tsPos));
    parts.push(htmlElement);
    prevTEPos = token.tePos + 1 //1 should be dynamic;
  }

  return parts.join("");
}

function tokenToHtmlElement(token) {
  let tagName;
  switch (token.type) {
    case SYMBOL.LIST_START:
      tagName = "schemeeList";
      break;
    case SYMBOL.LIST_END:
      tagName = "/schemeeList";
      break;
    case SYMBOL.DICT_START:
      tagName = "schemeeDict";
      break;
    case SYMBOL.DICT_END:
      tagName = "schemeeDict";
      break;
    case SYMBOL.VALUE:
      tagName = "schemeeValue";
      break;
  }

  return `<${tagName}${token.id ? ` class="${token.id}"` : ""}>` + (token.type === TYPE.VALUE ? `</${tagName}>`: "");
}

/**
 * adds selector field to deserved token;
 * @param {Array[__token]} tokens 
 * @param {String} input 
 */
function __attachSelector($, token, parentToken) {
  if (!token.id) return;
  const schemeeElm = $(`.${token.id}`);
  if (!schemeeElm) throw "token element not found";
  let elm;
  if (
    token.type === TYPE.DICT ||
    token.type === TYPE.LIST 
  ) {
    elm = schemeeElm.children().first();
  } else {
    elm = schemeeElm.parent();
  }

  const uniqueSelector = elm.getUniqueSelector();
  let selector = uniqueSelector.replace(/((schemeelist)|(schemeedict)|(schemeevalue)) > /, "");
  if (parentToken.selector) {
    const i = selector.lastIndexOf(parentToken.selector);
    selector = selector.substring(i + parentToken.selector.length + 3);
  }

  const path = selector.split(" > ").map(sign => {
    sign = sign.split(":");
    if (sign.length === 1) return {sign: sign[0]};
    let n;
    if (sign[1] === "first-child") n = 0;
    else if (sign[1] === "last-child") n = "last";
    else {
      const parsed = /nth\-child\((\d+)\)/.exec(sign[1]);
      n = +parsed[1] - 1;
    }

    return {sign: sign[0], i: n}
  });
  
  token.selector = selector;
  token.path = path;
}

/**
 * extracts values from input string based on the pattern;
 * @param {String} name 
 * @param {String} input 
 */

function extract(name, input) {
  const $ = cheerio.load(input);
  const blueprint = this.blueprints[name];
  if (!blueprint) throw "blueprint not founded";
  const path = [];
  const rootPathNode = __pathNode(
    blueprint.treeRoot,
    $("html").get(0)
  );
  __pathForward(path, rootPathNode);

  while(true) {
    const lastPath = __elemAt(path, -1);
    // console.log(">>>turn", lastPath.token.name);
    if (!lastPath) break;
    ////("here", lastPath.token.name)
    if (lastPath.token.type === TYPE.VALUE) {
      console.log(">> at value", lastPath.node.attribs)
      const prevPath = __elemAt(path, -2);
      if (!prevPath) throw "prevPath is not defined!";
      __addValue(prevPath, lastPath, __text(lastPath.node));
      __pathBackward(path);
    } else {
      if (lastPath.token.type === TYPE.DICT) {
          const nextToken = __getNextItem(lastPath);
          if (!nextToken) {
            __pathBackward(path);
            continue;
          }

        __pathForward(path, __pathNode(
          nextToken,
          __findNode(nextToken.path, lastPath.node),
          lastPath
        ));
      } else {
        let nextToken = __getNextItem(lastPath);
        if (!nextToken) {
          console.log(":::", lastPath)
          const nextNode = __getNextNode(lastPath.prevNode);
          if (!nextNode) {
            console.log("**")
            __pathBackward(path);
            continue;
          }
          console.log("nextNode: ", nextNode.attribs)
          lastPath.prevNode = nextNode;
          nextToken = __getFirstItem(lastPath);
          __pathForward(path, __pathNode(
            nextToken,
            nextNode,
            lastPath
          ));
          continue;
        }
        console.log(lastPath.node.type, lastPath.node.name, nextToken.name);
        const nextNode = __findNode(nextToken.path, lastPath.node);
        lastPath.prevNode = nextNode;
        __pathForward(path, __pathNode(
          nextToken,
          nextNode,
          lastPath
        ));
      }
    }
  }

  console.log(rootPathNode.result.product)
}

function __getNextNode(prevNode) {
  let resNode = prevNode.next;
  while(resNode && resNode.type === "text") {
    resNode = resNode.next;
  }
  return resNode;
}

function __addValue(prevPathNode, lastPathNode, value) {
  if (prevPathNode.token.type === TYPE.DICT) {
    prevPathNode.result[lastPathNode.token.name] = value;
  } else {
    let lastElement = __elemAt(prevPathNode, -1);
    ////(lastElement,prevPathNode.token, "dony" , prevPathNode.token, "dani")
    if (!lastElement) {
      lastElement = {};
      prevPathNode.result.push(lastElement);
    }

    lastElement[lastPathNode.token.name] = value;
  }
}

function __pathForward(path, pathNode) {
  path.push(pathNode);
}

function __pathBackward(path) {
  ////("path backward", path[path.length - 1]);
  return path.pop();
} 

function __getNextItem(pathNode) {
  console.log(pathNode.cursor)
  return pathNode.token.items[pathNode.cursor++];
}

function __getFirstItem(pathNode) {
  pathNode.cursor = 1;
  return pathNode.token.items[0];
}

function __elemAt(arr, i) {
  if (i < 0) return arr[arr.length + i];
  return arr[i];
}

function __pathNode(token, node, prevPathNode) {
  if (!node) throw "node is undefined!";
  let pathNode = {
    token, 
    node,
    index: 0
  }

  if (token.type !== TYPE.VALUE) {
    const result = token.type === TYPE.LIST ? [] : {};
    if (prevPathNode) {
      if (prevPathNode.token.type === TYPE.DICT) {
        prevPathNode.result[token.name] = result;
      } else {
        prevPathNode.result.push(result);
      }
    }
    pathNode = {
      ...pathNode, 
      result,
      cursor: 0,
    }

    if (token.type !== TYPE.LIST) {
      pathNode = {
        ...pathNode, 
        prevNode: null
      }
    }
  }

  return pathNode;
}

function __findNode(path, parentNode) {
  let activeNode = parentNode;

  // TODO should add some flags to check that element founded or not 
  // because at this point when if desired node not founded it doesn't
  // throws any error;
  for (const {sign, index} of path) {
    if (index) {
      activeNode = activeNode.children[index];
    } else {
      for (const child of activeNode.children) {
        if (child.name === sign) {
          activeNode = child;
          break;
        }
      }
    }
  }
  console.log(":>", activeNode.type, activeNode.name);
  return activeNode;
}

/**
 * get text of the node with type text;
 * at this point just childrens will checked;
 * @param {Node} node 
 */
function __text(node) {
  if (!node.children) return "";
  return node.children.reduce((acc, cur) => {
    return cur.type === "text" ? acc + cur.data : acc
  }, "");
}

function schemee() {
  this.blueprints = {};

  this.blueprint = blueprint;
  this.extract = extract;
}

module.exports = () => {
  return new schemee();
};