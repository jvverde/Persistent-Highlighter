// ==UserScript==
// @name         Persistent Highlighter with De-highlight Option
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Highlight selected text and remember it on reload, with de-highlight options
// @author       You
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY = location.href + '-highlights';
    let selectedColor = '#ffff00'; // Default highlight color

    // Cache DOM operations
    const createElement = (tag, props) => Object.assign(document.createElement(tag), props);
    const createTextNode = text => document.createTextNode(text);
    const querySelectorAll = selector => document.querySelectorAll(selector);

    function highlightSelection() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const selectedNodes = getSelectedTextNodes(range);
        if (!selectedNodes.length) return;

        const highlights = JSON.parse(localStorage.getItem(STORAGE_KEY) || [];
        const newHighlights = [];

        selectedNodes.forEach(node => {
            if (node.parentNode.classList.contains('highlighted')) return;

            const xpath = getXPath(node);
            const start = node === range.startContainer ? range.startOffset : 0;
            const end = node === range.endContainer ? range.endOffset : node.nodeValue.length;

            newHighlights.push({ xpath, start, end, color: selectedColor });
            applyHighlight(node, start, end, selectedColor);
        });

        if (newHighlights.length) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify([...highlights, ...newHighlights]));
        }

        selection.removeAllRanges();
    }

    function applyHighlight(textNode, start, end, color) {
        const textContent = textNode.nodeValue;
        const parent = textNode.parentNode;
        
        // Create all nodes at once
        const nodes = [
            start > 0 ? createTextNode(textContent.substring(0, start)) : null,
            createElement('span', {
                style: `background-color:${color}`,
                className: 'highlighted',
                textContent: textContent.substring(start, end),
                onclick: removeHighlight
            }),
            end < textContent.length ? createTextNode(textContent.substring(end)) : null
        ].filter(Boolean);

        // Replace in one operation
        const fragment = document.createDocumentFragment();
        nodes.forEach(node => fragment.appendChild(node));
        parent.replaceChild(fragment, textNode);
    }

    function removeHighlight(event) {
        const span = event.target;
        const textNode = createTextNode(span.textContent);
        span.replaceWith(textNode);

        // Update storage more efficiently
        const highlights = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        const xpath = getXPath(span);
        const newHighlights = highlights.filter(h => h.xpath !== xpath);
        
        if (newHighlights.length !== highlights.length) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newHighlights));
        }
    }

    function loadHighlights() {
        const highlights = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        
        // Batch processing for better performance
        const batchSize = 50;
        for (let i = 0; i < highlights.length; i += batchSize) {
            const batch = highlights.slice(i, i + batchSize);
            setTimeout(() => {  // Yield to browser for rendering
                batch.forEach(({ xpath, start, end, color }) => {
                    const node = getElementByXPath(xpath);
                    if (node) applyHighlight(node, start, end, color);
                });
            }, 0);
        }
    }

    function dehighlightSelection() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const selectedNodes = getSelectedTextNodes(range);
        let highlights = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        let modified = false;

        selectedNodes.forEach(node => {
            if (node.parentNode.classList.contains('highlighted')) {
                const span = node.parentNode;
                span.replaceWith(createTextNode(span.textContent));
                
                // Track modifications
                const initialLength = highlights.length;
                highlights = highlights.filter(h => h.xpath !== getXPath(span));
                modified = modified || (highlights.length !== initialLength);
            }
        });

        if (modified) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(highlights));
        }

        selection.removeAllRanges();
    }

    function clearAllHighlights() {
        // Use classList for better performance
        querySelectorAll('.highlighted').forEach(span => {
            span.replaceWith(createTextNode(span.textContent));
        });
        localStorage.removeItem(STORAGE_KEY);
    }

    function getSelectedTextNodes(range) {
        const selectedNodes = [];
        const startNode = range.startContainer;
        const endNode = range.endContainer;

        // Optimized traversal
        const treeWalker = document.createTreeWalker(
            range.commonAncestorContainer,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: node => {
                    if (node === startNode || node === endNode || range.intersectsNode(node)) {
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    return NodeFilter.FILTER_SKIP;
                }
            }
        );

        while (treeWalker.nextNode()) {
            selectedNodes.push(treeWalker.currentNode);
        }

        return selectedNodes;
    }

    function getXPath(node) {
        if (!node) return '';
        if (node.nodeType === Node.TEXT_NODE) {
            return getXPath(node.parentNode) + "/text()";
        }
        if (node.nodeType !== Node.ELEMENT_NODE) {
            return '';
        }
        if (node.id) return `id('${node.id}')`;
        if (node === document.body) return '/html/body';

        let ix = 0;
        const siblings = node.parentNode?.childNodes || [];
        for (let i = 0; i < siblings.length; i++) {
            const sibling = siblings[i];
            if (sibling === node) {
                return `${getXPath(node.parentNode)}/${node.tagName.toLowerCase()}[${ix + 1}]`;
            }
            if (sibling.nodeType === 1 && sibling.tagName === node.tagName) ix++;
        }
        return '';
    }

    function getElementByXPath(xpath) {
        try {
            return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        } catch (e) {
            return null;
        }
    }

    function createUI() {
        const style = {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            padding: '10px',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            border: '1px solid #ccc',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: '10000',
            fontFamily: 'sans-serif'
        };

        const container = createElement('div', {
            id: 'highlight-toolbox',
            style: Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';')
        });

        const closeBtn = createElement('span', {
            innerHTML: '&times;',
            title: 'Close toolbox',
            style: 'float:right;cursor:pointer;margin-bottom:5px;font-size:16px;color:#888',
            onclick: () => container.remove()
        });

        const colorInput = createElement('input', {
            type: 'color',
            value: selectedColor,
            style: 'margin-bottom:6px',
            oninput: e => selectedColor = e.target.value
        });

        const makeButton = (text, onClick) => createElement('button', {
            innerText: text,
            style: 'margin:4px 2px;padding:6px 10px;border:none;border-radius:4px;cursor:pointer;' +
                   'font-size:14px;background-color:#1976d2;color:#fff;transition:background-color 0.2s',
            onmouseover: e => e.target.style.backgroundColor = '#1565c0',
            onmouseout: e => e.target.style.backgroundColor = '#1976d2',
            onclick: onClick
        });

        container.append(
            closeBtn,
            document.createElement('br'),
            colorInput,
            document.createElement('br'),
            makeButton('Highlight', highlightSelection),
            makeButton('De-highlight', dehighlightSelection),
            makeButton('Clear All', clearAllHighlights)
        );

        document.body.appendChild(container);
    }

    // Use MutationObserver to handle dynamic content
    const observer = new MutationObserver(mutations => {
        if (!localStorage.getItem(STORAGE_KEY)) return;
        
        for (const mutation of mutations) {
            if (mutation.addedNodes.length) {
                loadHighlights();
                break;
            }
        }
    });

    window.addEventListener('load', () => {
        loadHighlights();
        createUI();
        observer.observe(document.body, { childList: true, subtree: true });
    });
})();