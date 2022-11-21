/*
 * Copyright 2020 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import {getScrollParent, isWebKit} from './';

let observerMap = new Map<string, IntersectionObserver>();
let isScrollPrevented = false;

export function setScrollPrevented(value: boolean) {
  isScrollPrevented = value;
}

/**
 * Scrolls `scrollView` so that `element` is visible.
 * Similar to `element.scrollIntoView({block: 'nearest'})` (not supported in Edge),
 * but doesn't affect parents above `scrollView`.
 */
export function scrollIntoView(scrollView: HTMLElement, element: HTMLElement) {
  let offsetX = relativeOffset(scrollView, element, 'left');
  let offsetY = relativeOffset(scrollView, element, 'top');
  let width = element.offsetWidth;
  let height = element.offsetHeight;
  let x = scrollView.scrollLeft;
  let y = scrollView.scrollTop;
  let maxX = x + scrollView.offsetWidth;
  let maxY = y + scrollView.offsetHeight;
  if (offsetX <= x) {
    x = offsetX;
  } else if (offsetX + width > maxX) {
    x += offsetX + width - maxX;
  }
  if (offsetY <= y) {
    y = offsetY;
  } else if (offsetY + height > maxY) {
    y += offsetY + height - maxY;
  }

  scrollView.scrollLeft = x;
  scrollView.scrollTop = y;
}

/**
 * Computes the offset left or top from child to ancestor by accumulating
 * offsetLeft or offsetTop through intervening offsetParents.
 */
function relativeOffset(ancestor: HTMLElement, child: HTMLElement, axis: 'left'|'top') {
  const prop = axis === 'left' ? 'offsetLeft' : 'offsetTop';
  let sum = 0;
  while (child.offsetParent) {
    sum += child[prop];
    if (child.offsetParent === ancestor) {
      // Stop once we have found the ancestor we are interested in.
      break;
    } else if (child.offsetParent.contains(ancestor)) {
      // If the ancestor is not `position:relative`, then we stop at
      // _its_ offset parent, and we subtract off _its_ offset, so that
      // we end up with the proper offset from child to ancestor.
      sum -= ancestor[prop];
      break;
    }
    child = child.offsetParent as HTMLElement;
  }
  return sum;
}


function optionsToString(options: ScrollIntoViewOptions) {
  return Object.keys(options).sort().map(key => `${key}${options[key]}`).toString();
}

export function scrollIntoViewFully(target: Element, scrollOptions?: ScrollIntoViewOptions) {
  const intersectionObserverOptions: IntersectionObserverInit = {
    root: undefined,
    rootMargin: '0px',
    // Safari doesn't work with theshold=1. Setting root to document.body or document.documentElement doesn't fix it either
    threshold: isWebKit() ? .9 : 1
  };

  if (scrollOptions == null) {
    scrollOptions = {
      block: 'nearest'
    };
  }

  let intersectionObserverCallback = (entries: Array<IntersectionObserverEntry>, observer: IntersectionObserver) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) {
        scrollIntoViewHelper(entry.target, scrollOptions);
      }
      observer.unobserve(entry.target);
    });
  };

  if (target) {
    let observerMapKey = optionsToString(scrollOptions);
    let observer = observerMap.get(observerMapKey);
    if (!observer) {
      observer = new IntersectionObserver(intersectionObserverCallback, intersectionObserverOptions);
      observerMap.set(observerMapKey, observer);
    }

    observer.observe(target);
  }
}

// TODO: rename? combine with scrollintoview above? Replace scrollIntoView above (would need to add param for scrollRef so that we could have old behavior)?
// Perhaps add a parameter to this func to customize the root so we can say how far up we want to actually adjust the scroll?
// scrollIntoView is exported and available from aria/utils so is it a breaking change to replace it with this func?
// TODO: test with zoom/pinch zoom
function scrollIntoViewHelper(target: Element, scrollOptions: ScrollIntoViewOptions) {
  let root = document.scrollingElement || document.documentElement;
  let scrollParent = getScrollParent(target);

  // If scrolling is not currently prevented then we aren’t in a overlay nor is a overlay open, just use element.scrollIntoView to bring the element into view
  if (!isScrollPrevented) {
    target?.scrollIntoView?.(scrollOptions);
  } else {
    // If scrolling is prevented, we don't want to scroll the body since it will break the open overlay's positioning.
    while (target && scrollParent && target !== root && scrollParent !== root) {
      // TODO: adapt scrollIntoView so that it can work with the provided ScrollIntoViewOptions instead of mimicking scrollIntoView({block: 'nearest'}) only
      // do this if we decide we actually want the scrollOption flexibility
      scrollIntoView(scrollParent as HTMLElement, target as HTMLElement);
      target = scrollParent;
      scrollParent = getScrollParent(target);
    }
  }
}
