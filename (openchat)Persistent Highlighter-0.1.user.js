// ==UserScript==
// @name         Persistent Highlighter with De-highlight Option
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Highlight selected text and remember it on reload, with de-highlight options
// @author       You
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let selectedColor = '#ffff00'; // Default highlight color

    function highlightSelection() {
        let selection = window.getSelection();
        if (!selection.rangeCount) return;

        let range = selection.getRangeAt(0);
        let selectedNodes = getSelectedTextNodes(range);
        let highlights = JSON.parse(localStorage.getItem(location.href + '-highlights') || '[]');

        selectedNodes.forEach(node => {
            if (node.parentNode.classList.contains('highlighted')) return; // Avoid re-highlighting

            let xpath = getXPath(node);
            let start = node === range.startContainer ? range.startOffset : 0;
            let end = node === range.endContainer ? range.endOffset : node.nodeValue.length;

            highlights.push({ xpath, start, end, color: selectedColor });

            applyHighlight(node, start, end, selectedColor);
        });

        localStorage.setItem(location.href + '-highlights', JSON.stringify(highlights));
        console.log('Saved highlights:', highlights);

        selection.removeAllRanges();
    }

    function applyHighlight(textNode, start, end, color) {
        let textContent = textNode.nodeValue;
        let beforeText = textContent.substring(0, start);
        let highlightText = textContent.substring(start, end);
        let afterText = textContent.substring(end);

        let span = document.createElement('span');
        span.style.backgroundColor = color;
        span.classList.add('highlighted');
        span.textContent = highlightText;
        span.addEventListener('click', removeHighlight); // Click to remove

        let parent = textNode.parentNode;
        let beforeNode = beforeText ? document.createTextNode(beforeText) : null;
        let afterNode = afterText ? document.createTextNode(afterText) : null;

        if (beforeNode) parent.insertBefore(beforeNode, textNode);
        parent.insertBefore(span, textNode);
        if (afterNode) parent.insertBefore(afterNode, textNode);
        parent.removeChild(textNode);
    }

    function removeHighlight(event) {
        let span = event.target;
        let textNode = document.createTextNode(span.textContent);
        span.replaceWith(textNode);
        
        // Update storage to remove this specific highlight
        let highlights = JSON.parse(localStorage.getItem(location.href + '-highlights') || '[]');
        let newHighlights = highlights.filter(h => h.xpath !== getXPath(span));
        localStorage.setItem(location.href + '-highlights', JSON.stringify(newHighlights));
    }

    function loadHighlights() {
        let highlights = JSON.parse(localStorage.getItem(location.href + '-highlights') || '[]');
        console.log('Loaded highlights:', highlights);

        highlights.forEach(({ xpath, start, end, color }) => {
            let node = getElementByXPath(xpath);
            if (node) {
                applyHighlight(node, start, end, color);
            }
        });
    }

    function dehighlightSelection() {
        let selection = window.getSelection();
        if (!selection.rangeCount) return;

        let range = selection.getRangeAt(0);
        let selectedNodes = getSelectedTextNodes(range);
        let highlights = JSON.parse(localStorage.getItem(location.href + '-highlights') || '[]');

        selectedNodes.forEach(node => {
            if (node.parentNode.classList.contains('highlighted')) {
                let span = node.parentNode;
                let textNode = document.createTextNode(span.textContent);
                span.replaceWith(textNode);

                // Remove from storage
                highlights = highlights.filter(h => h.xpath !== getXPath(span));
            }
        });

        localStorage.setItem(location.href + '-highlights', JSON.stringify(highlights));
        selection.removeAllRanges();
    }

    function clearAllHighlights() {
        document.querySelectorAll('.highlighted').forEach(span => {
            let textNode = document.createTextNode(span.textContent);
            span.replaceWith(textNode);
        });
        localStorage.removeItem(location.href + '-highlights');
        console.log('All highlights cleared.');
    }

    function getSelectedTextNodes(range) {
        let selectedNodes = [];
        let startNode = range.startContainer;
        let endNode = range.endContainer;

        function traverse(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                if (node === startNode || node === endNode || range.intersectsNode(node)) {
                    selectedNodes.push(node);
                }
            } else {
                node.childNodes.forEach(traverse);
            }
        }

        traverse(range.commonAncestorContainer);
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
        let siblings = node.parentNode ? node.parentNode.childNodes : [];
        for (let i = 0; i < siblings.length; i++) {
            let sibling = siblings[i];
            if (sibling === node) return `${getXPath(node.parentNode)}/${node.tagName.toLowerCase()}[${ix + 1}]`;
            if (sibling.nodeType === 1 && sibling.tagName === node.tagName) ix++;
        }
    }

    function getElementByXPath(xpath) {
        return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    }

    function createUI() {
        let container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.bottom = '10px';
        container.style.right = '10px';
        container.style.padding = '5px';
        container.style.backgroundColor = 'white';
        container.style.border = '1px solid black';
        container.style.zIndex = '10000';

        let colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = selectedColor;
        colorInput.addEventListener('input', e => selectedColor = e.target.value);

        let highlightButton = document.createElement('button');
        highlightButton.innerText = 'Highlight';
        highlightButton.addEventListener('click', highlightSelection);

        let dehighlightButton = document.createElement('button');
        dehighlightButton.innerText = 'De-highlight';
        dehighlightButton.addEventListener('click', dehighlightSelection);

        let clearButton = document.createElement('button');
        clearButton.innerText = 'Clear All';
        clearButton.addEventListener('click', clearAllHighlights);

        container.appendChild(colorInput);
        container.appendChild(highlightButton);
        container.appendChild(dehighlightButton);
        container.appendChild(clearButton);
        document.body.appendChild(container);
    }

    window.addEventListener('load', () => {
        loadHighlights();
        createUI();
    });

})();
