/* ==========================================================================
   RUNNING TUBA AV — Site Scripts
   Vanilla JS only. No dependencies.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- Sticky header state ---------------------------------------- */
  var header = document.querySelector('.site-header');
  function onScroll() {
    if (!header) return;
    header.classList.toggle('stuck', window.scrollY > 12);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Divisions dropdown ----------------------------------------- */
  var ddBtn = document.querySelector('.navlink[data-dropdown]');
  var ddMenu = document.getElementById('divisions-menu');

  function closeDropdown() {
    if (!ddBtn || !ddMenu) return;
    ddBtn.setAttribute('aria-expanded', 'false');
    ddMenu.classList.remove('open');
  }
  function toggleDropdown() {
    if (!ddBtn || !ddMenu) return;
    var open = ddBtn.getAttribute('aria-expanded') === 'true';
    ddBtn.setAttribute('aria-expanded', String(!open));
    ddMenu.classList.toggle('open', !open);
  }

  if (ddBtn && ddMenu) {
    ddBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleDropdown();
    });

    // Hover open on pointer-capable, wide viewports only.
    var parentLi = ddBtn.closest('li');
    if (parentLi && window.matchMedia('(min-width: 861px)').matches) {
      parentLi.addEventListener('mouseenter', function () {
        ddBtn.setAttribute('aria-expanded', 'true');
        ddMenu.classList.add('open');
      });
      parentLi.addEventListener('mouseleave', closeDropdown);
    }

    document.addEventListener('click', function (e) {
      if (ddMenu.contains(e.target) || ddBtn.contains(e.target)) return;
      closeDropdown();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeDropdown();
        closeMobileNav();
      }
    });

    // Keyboard: arrow down from the trigger enters the menu.
    ddBtn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        ddBtn.setAttribute('aria-expanded', 'true');
        ddMenu.classList.add('open');
        var first = ddMenu.querySelector('a');
        if (first) first.focus();
      }
    });
  }

  /* ---------- Mobile navigation ------------------------------------------ */
  var burger = document.querySelector('.burger');
  var navList = document.querySelector('.nav-links');

  function closeMobileNav() {
    if (!burger || !navList) return;
    burger.setAttribute('aria-expanded', 'false');
    navList.classList.remove('open');
    document.body.style.overflow = '';
  }

  if (burger && navList) {
    burger.addEventListener('click', function () {
      var open = burger.getAttribute('aria-expanded') === 'true';
      burger.setAttribute('aria-expanded', String(!open));
      navList.classList.toggle('open', !open);
      document.body.style.overflow = !open ? 'hidden' : '';
    });

    navList.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeMobileNav);
    });
  }

  /* ---------- Project brief form ----------------------------------------- */
  var form = document.getElementById('project-form');
  if (form) {
    var success = document.getElementById('form-success');
    var failure = document.getElementById('form-error');

    var setError = function (field, message) {
      var input = field.querySelector('input, select, textarea');
      var slot = field.querySelector('.err');
      if (slot) slot.textContent = message || '';
      if (input) {
        if (message) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
      }
      return !message;
    };

    var isEmail = function (v) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
    };

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = true;
      var firstBad = null;

      form.querySelectorAll('.field').forEach(function (field) {
        var input = field.querySelector('input, select, textarea');
        if (!input || !input.required) return;

        var value = (input.value || '').trim();
        var message = '';

        if (!value) {
          message = 'This field is required.';
        } else if (input.type === 'email' && !isEmail(value)) {
          message = 'Enter a valid email address.';
        }

        var fieldOk = setError(field, message);
        if (!fieldOk) {
          ok = false;
          if (!firstBad) firstBad = input;
        }
      });

      if (!ok) {
        if (firstBad) firstBad.focus();
        return;
      }

      // Send to the Cloudflare Pages Function (functions/api/contact.js).
      // Success is shown ONLY when the server confirms the email was handed
      // off; any other outcome shows the phone number, and the form keeps
      // what the visitor typed.
      var button = form.querySelector('button[type="submit"]');
      var label = button ? button.innerHTML : '';
      if (failure) failure.classList.add('hidden');
      if (button) { button.disabled = true; button.textContent = 'Sending…'; }

      var payload = {};
      new FormData(form).forEach(function (value, key) { payload[key] = value; });

      fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (!res.ok || body.result !== 'ok') throw new Error('contact form: ' + res.status);
        });
      }).then(function () {
        form.classList.add('hidden');
        if (success) {
          success.classList.remove('hidden');
          success.setAttribute('tabindex', '-1');
          success.focus();
          success.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }).catch(function (err) {
        if (window.console) console.error(err);
        if (button) { button.disabled = false; button.innerHTML = label; }
        if (failure) {
          failure.classList.remove('hidden');
          failure.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    });

    // Clear an error as soon as the user starts fixing it.
    form.querySelectorAll('input, select, textarea').forEach(function (input) {
      input.addEventListener('input', function () {
        var field = input.closest('.field');
        if (field && input.getAttribute('aria-invalid') === 'true') {
          setError(field, '');
        }
      });
    });
  }

  /* ---------- Gallery lightbox ------------------------------------------- */
  var lb = document.getElementById('lightbox');
  var shots = Array.prototype.slice.call(
    document.querySelectorAll('.shot[data-full]')
  );

  if (lb && shots.length) {
    var lbImg = document.getElementById('lb-img');
    var lbCap = document.getElementById('lb-cap');
    var lbCount = document.getElementById('lb-count');
    var btnClose = lb.querySelector('.lb-close');
    var btnPrev = lb.querySelector('.lb-prev');
    var btnNext = lb.querySelector('.lb-next');
    var index = 0;
    var lastFocus = null;

    // Single image: navigation arrows would be noise.
    if (shots.length < 2) {
      btnPrev.hidden = true;
      btnNext.hidden = true;
    }

    function show(i) {
      index = (i + shots.length) % shots.length;
      var shot = shots[index];
      lbImg.src = shot.getAttribute('data-full');
      lbImg.alt = shot.getAttribute('data-caption') || '';
      lbCap.textContent = shot.getAttribute('data-caption') || '';
      lbCount.textContent = shots.length > 1
        ? (index + 1) + ' / ' + shots.length
        : '';
    }

    function open(i) {
      lastFocus = document.activeElement;
      show(i);
      lb.hidden = false;
      document.body.style.overflow = 'hidden';
      // Next frame so the opacity transition actually runs.
      requestAnimationFrame(function () { lb.classList.add('open'); });
      btnClose.focus();
    }

    function close() {
      lb.classList.remove('open');
      document.body.style.overflow = '';
      window.setTimeout(function () {
        lb.hidden = true;
        lbImg.src = '';
      }, 220);
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    shots.forEach(function (shot, i) {
      shot.addEventListener('click', function () { open(i); });
    });

    btnClose.addEventListener('click', close);
    btnPrev.addEventListener('click', function () { show(index - 1); });
    btnNext.addEventListener('click', function () { show(index + 1); });

    // Click the backdrop (but not the image) to dismiss.
    lb.addEventListener('click', function (e) {
      if (e.target === lb) close();
    });

    document.addEventListener('keydown', function (e) {
      if (lb.hidden) return;
      if (e.key === 'Escape') { close(); return; }
      if (shots.length < 2) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(index - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); show(index + 1); }
    });

    // Keep tab focus inside the dialog while it is open.
    lb.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var focusable = Array.prototype.slice
        .call(lb.querySelectorAll('button'))
        .filter(function (b) { return !b.hidden; });
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    });
  }

  /* ---------- Credential glossary popover --------------------------------
     Every certification in the About-page table is clickable. Buyers on a
     school board or hospital committee should not have to google "CTS-D".
     ---------------------------------------------------------------------- */
  var GLOSSARY = {
    'cts': ['CTS', 'Certified Technology Specialist — AVIXA',
      'The core, vendor-neutral certification for audiovisual professionals. It covers how AV systems are designed, installed, operated and maintained end to end, and it is the baseline credential most of the industry recognises. Holders recertify on a rolling cycle through continuing education, so it reflects current practice rather than a one-time exam.'],
    'cts-d': ['CTS-D', 'Certified Technology Specialist — Design',
      'An advanced AVIXA certification for people who design AV systems, and it requires holding CTS first. It covers gathering requirements and the audio, video, control and infrastructure engineering behind a system — the work that happens long before anything is mounted on a wall.'],
    'cts-i': ['CTS-I', 'Certified Technology Specialist — Installation',
      'An advanced AVIXA certification for people who install AV systems, and it requires holding CTS first. It covers mounting and rigging, cable pathways, terminations, system verification and safe, code-aware practice on an active job site.'],
    'avixa': ['AVIXA', 'Audiovisual and Integrated Experience Association',
      'The industry trade body for professional AV. It issues the CTS, CTS-D and CTS-I certifications, publishes AV performance standards, and runs training including project management for AV programmes.'],
    'qsys': ['Q-SYS', 'QSC Q-SYS platform',
      'A software-based audio, video and control platform used across conferencing, worship, education and live venues. QSC runs tiered training — from Level 1 fundamentals up to control programming — so a technician’s Q-SYS level tells you what they can configure versus what they can actually build.'],
    'dante': ['Dante', 'Audinate Dante audio networking',
      'The most widely deployed way of carrying uncompressed, low-latency audio over standard IP networks. Audinate certifies across three levels covering setup and routing, redundancy and clocking, and network design alongside a customer’s IT team.'],
    'crestron': ['Crestron', 'Crestron control and AV systems',
      'A control and AV distribution platform common in corporate and high-end environments. Crestron certifies programmers separately from installers, because programming their systems is a software discipline rather than a wiring one.'],
    'extron': ['Extron', 'Extron Electronics',
      'A manufacturer of switching, distribution and control hardware found in a great many classrooms and meeting rooms. Their training covers system configuration and their control programming environment.'],
    'biamp': ['Biamp', 'Biamp digital signal processing',
      'A manufacturer of DSP hardware — the Tesira line especially — used for conference audio, paging and room acoustics correction. Certification covers configuring and tuning the processing that decides whether a room sounds intelligible or not.'],
    'shure': ['Shure', 'Shure audio systems',
      'A manufacturer of microphones, wireless systems and ceiling array mics. Their training covers RF coordination and conferencing microphone deployment — the parts that most often go wrong once a room is full of people.'],
    'jblbose': ['JBL / Bose', 'Loudspeaker manufacturers',
      'Loudspeaker and sound-system manufacturers whose training programmes cover system design, deployment and tuning for their specific product lines.'],
    'networking': ['Networking', 'IT networking fundamentals',
      'Switching, VLANs, IP addressing, multicast and quality of service. Modern AV is a networked discipline, and a designer who cannot hold a credible conversation with the customer’s IT department is a risk to the project.'],
    'networkplus': ['CompTIA Network+', 'Vendor-neutral networking certification',
      'A widely recognised IT certification covering network infrastructure, addressing, troubleshooting and security basics. It matters in AV because audio and video increasingly ride the same network as everything else in the building.'],
    'ccna': ['CCNA', 'Cisco Certified Network Associate',
      'Cisco’s associate-level networking certification. It goes deeper than Network+ on switching and routing, which is relevant when AV shares enterprise infrastructure and has to satisfy a customer’s network security requirements.'],
    'avoverip': ['AV-over-IP', 'Networked AV distribution',
      'Distributing video and audio across standard network switches instead of dedicated matrix hardware. Manufacturer certification here confirms someone can plan bandwidth, multicast and switch configuration properly rather than hoping it works on the day.'],
    'mfr': ['Manufacturer certifications', 'Product-specific training',
      'Training programmes run by the manufacturers themselves, confirming a technician has been trained on the exact hardware being installed. On many product lines this is also a condition of extended warranty coverage.'],
    'pmp': ['PMP', 'Project Management Professional — PMI',
      'A general project-management certification covering scope, schedule, cost, risk and stakeholder management. On larger AV programmes it signals someone can run the project itself, not only the technology inside it.'],
    'osha': ['OSHA', 'Occupational Safety and Health Administration training',
      'Job-site safety training, most commonly the 10-hour or 30-hour construction courses. It is frequently a condition of being allowed onto an active construction or renovation site at all.'],
    'lift': ['Lift certification', 'Aerial and scissor lift operation',
      'Operator training for scissor and boom lifts. AV installation involves constant overhead work — hanging displays, rigging loudspeakers, running cable above ceilings — and most facilities require documented certification before anyone leaves the ground.']
  };

  var pop = document.getElementById('cred-pop');
  var terms = Array.prototype.slice.call(document.querySelectorAll('[data-term]'));

  if (pop && terms.length) {
    var popAbbr = document.getElementById('pop-abbr');
    var popName = document.getElementById('pop-name');
    var popBody = document.getElementById('pop-body');
    var popArrow = pop.querySelector('.pop-arrow');
    var popClose = pop.querySelector('.pop-close');
    var activeTerm = null;
    var openedByHover = false;
    var hoverTimer = null;

    function placePop(trigger) {
      var r = trigger.getBoundingClientRect();
      var pw = pop.offsetWidth;
      var ph = pop.offsetHeight;
      var margin = 12;

      // Prefer below the term; flip above when there is not room.
      var below = r.bottom + margin + ph <= window.innerHeight;
      var top = below ? r.bottom + margin : r.top - ph - margin;

      var left = r.left + r.width / 2 - pw / 2;
      left = Math.max(16, Math.min(left, window.innerWidth - pw - 16));

      pop.style.top = Math.max(8, top) + 'px';
      pop.style.left = left + 'px';

      // Arrow tracks the trigger, clamped inside the panel.
      var ax = r.left + r.width / 2 - left - 5.5;
      ax = Math.max(14, Math.min(ax, pw - 25));
      popArrow.style.left = ax + 'px';
      if (below) {
        popArrow.style.top = '-6px';
        popArrow.style.bottom = '';
        popArrow.style.transform = 'rotate(45deg)';
      } else {
        popArrow.style.top = '';
        popArrow.style.bottom = '-6px';
        popArrow.style.transform = 'rotate(225deg)';
      }
    }

    function closePop() {
      window.clearTimeout(hoverTimer);
      if (!activeTerm) return;
      openedByHover = false;
      activeTerm.setAttribute('aria-expanded', 'false');
      activeTerm = null;
      pop.classList.remove('open');
      window.setTimeout(function () { if (!activeTerm) pop.hidden = true; }, 180);
    }

    function openPop(trigger, fromHover) {
      var key = trigger.getAttribute('data-term');
      var entry = GLOSSARY[key];
      if (!entry) return;

      window.clearTimeout(hoverTimer);
      openedByHover = !!fromHover;
      if (activeTerm === trigger) {
        // Already showing this one (usually opened by hover) — just keep it.
        pop.classList.add('open');
        return;
      }
      if (activeTerm) activeTerm.setAttribute('aria-expanded', 'false');

      popAbbr.textContent = entry[0];
      popName.textContent = entry[1];
      popBody.textContent = entry[2];

      pop.hidden = false;
      activeTerm = trigger;
      trigger.setAttribute('aria-expanded', 'true');
      placePop(trigger);
      requestAnimationFrame(function () { pop.classList.add('open'); });
    }

    var canHover = window.matchMedia('(hover: hover) and (min-width: 861px)').matches;

    terms.forEach(function (t) {
      t.addEventListener('click', function (e) {
        e.stopPropagation();
        // A click on a hover-opened popover pins it rather than dismissing it.
        if (activeTerm === t && !openedByHover) { closePop(); return; }
        openPop(t, false);
      });

      if (canHover) {
        t.addEventListener('mouseenter', function () { openPop(t, true); });
        t.addEventListener('mouseleave', function () {
          if (!openedByHover || activeTerm !== t) return;
          hoverTimer = window.setTimeout(closePop, 220);
        });
      }
    });

    popClose.addEventListener('click', closePop);
    pop.addEventListener('click', function (e) { e.stopPropagation(); });
    // Moving onto the panel itself must not dismiss it mid-read.
    pop.addEventListener('mouseenter', function () { window.clearTimeout(hoverTimer); });
    pop.addEventListener('mouseleave', function () {
      if (openedByHover) hoverTimer = window.setTimeout(closePop, 220);
    });
    document.addEventListener('click', closePop);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closePop();
    });
    window.addEventListener('resize', function () {
      if (activeTerm) placePop(activeTerm);
    });
    window.addEventListener('scroll', function () {
      if (activeTerm) placePop(activeTerm);
    }, { passive: true });
  }

  /* ---------- Annotated room hotspots -----------------------------------
     Each marker opens a panel containing a zoomed crop of that exact spot,
     computed from the same image file — no separate crop assets to keep in
     sync, and the detail sharpens automatically if the photo is replaced.
     ---------------------------------------------------------------------- */
  var roomFig = document.querySelector('.roomshot');
  var roomPop = document.getElementById('room-pop');

  if (roomFig && roomPop) {
    var roomImg   = roomFig.querySelector('img');
    var spots     = Array.prototype.slice.call(roomFig.querySelectorAll('.hs'));
    var zoomBox   = roomPop.querySelector('.room-zoom');
    var rpKicker  = roomPop.querySelector('.rp-kicker');
    var rpTitle   = roomPop.querySelector('.rp-title');
    var rpList    = roomPop.querySelector('ul');
    var rpClose   = roomPop.querySelector('.rp-close');
    var activeSpot = null, roomTimer = null, pinned = false;
    var isTouch = !window.matchMedia('(hover: hover) and (min-width: 861px)').matches;

    function paintZoom(spot) {
      var fx = parseFloat(spot.dataset.x) / 100;
      var fy = parseFloat(spot.dataset.y) / 100;
      var z  = parseFloat(spot.dataset.zoom) || 3;

      var boxW = zoomBox.offsetWidth, boxH = zoomBox.offsetHeight;
      var ratio = (roomImg.naturalWidth || 1672) / (roomImg.naturalHeight || 941);
      var scaledW = boxW * z;
      var scaledH = scaledW / ratio;

      // centre the feature, then clamp so no empty edge shows
      var x = boxW / 2 - fx * scaledW;
      var y = boxH / 2 - fy * scaledH;
      x = Math.min(0, Math.max(boxW - scaledW, x));
      y = Math.min(0, Math.max(boxH - scaledH, y));

      zoomBox.style.backgroundImage = 'url("' + roomImg.getAttribute('src') + '")';
      zoomBox.style.backgroundSize = scaledW + 'px ' + scaledH + 'px';
      zoomBox.style.backgroundPosition = Math.round(x) + 'px ' + Math.round(y) + 'px';
    }

    function placeRoomPop(spot) {
      if (window.matchMedia('(max-width: 860px)').matches) return; // CSS docks it
      var r = spot.getBoundingClientRect();
      var pw = roomPop.offsetWidth, ph = roomPop.offsetHeight, gap = 16;

      // open away from whichever edge the marker sits nearest
      var left = (r.left + r.width / 2 > window.innerWidth / 2)
        ? r.left - pw - gap
        : r.right + gap;
      left = Math.max(14, Math.min(left, window.innerWidth - pw - 14));

      var top = r.top + r.height / 2 - ph / 2;
      top = Math.max(130, Math.min(top, window.innerHeight - ph - 14));

      roomPop.style.left = Math.round(left) + 'px';
      roomPop.style.top = Math.round(top) + 'px';
    }

    function fillRoomPop(spot) {
      rpKicker.textContent = spot.dataset.kicker || 'Installed by Running Tuba';
      rpTitle.textContent = spot.dataset.title || '';
      rpList.innerHTML = '';
      (spot.dataset.items || '').split('|').forEach(function (t) {
        if (!t.trim()) return;
        var li = document.createElement('li');
        li.textContent = t.trim();
        rpList.appendChild(li);
      });
    }

    function openRoom(spot) {
      window.clearTimeout(roomTimer);
      if (activeSpot && activeSpot !== spot) activeSpot.setAttribute('aria-expanded', 'false');
      activeSpot = spot;
      spot.setAttribute('aria-expanded', 'true');
      fillRoomPop(spot);
      roomPop.hidden = false;
      paintZoom(spot);          // needs layout, so after unhide
      placeRoomPop(spot);
      requestAnimationFrame(function () { roomPop.classList.add('open'); });
    }

    function closeRoom() {
      window.clearTimeout(roomTimer);
      if (activeSpot) activeSpot.setAttribute('aria-expanded', 'false');
      activeSpot = null; pinned = false;
      roomPop.classList.remove('open');
      window.setTimeout(function () { if (!activeSpot) roomPop.hidden = true; }, 180);
    }

    spots.forEach(function (spot) {
      spot.addEventListener('click', function (e) {
        e.stopPropagation();
        if (activeSpot === spot && pinned) { closeRoom(); return; }
        pinned = true; openRoom(spot);
      });
      if (!isTouch) {
        spot.addEventListener('mouseenter', function () { pinned = false; openRoom(spot); });
        spot.addEventListener('mouseleave', function () {
          if (pinned) return;
          roomTimer = window.setTimeout(closeRoom, 200);
        });
        spot.addEventListener('focus', function () { openRoom(spot); });
      }
    });

    roomPop.addEventListener('click', function (e) { e.stopPropagation(); });
    roomPop.addEventListener('mouseenter', function () { window.clearTimeout(roomTimer); });
    roomPop.addEventListener('mouseleave', function () {
      if (!pinned) roomTimer = window.setTimeout(closeRoom, 200);
    });
    rpClose.addEventListener('click', closeRoom);
    document.addEventListener('click', function () { if (pinned) closeRoom(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && activeSpot) closeRoom();
    });
    window.addEventListener('resize', function () {
      if (activeSpot) { paintZoom(activeSpot); placeRoomPop(activeSpot); }
    });
    window.addEventListener('scroll', function () {
      if (activeSpot) placeRoomPop(activeSpot);
    }, { passive: true });
  }

  /* ---------- Hero reel ---------------------------------------------------
     Six stitched clips, crossfaded, looping seamlessly. The source is only
     attached when it is worth the download: real screen, motion allowed,
     no data-saver. Everything else keeps the poster still, which is also
     the section background, so the hero is never empty.
     ------------------------------------------------------------------------ */
  var heroVid = document.querySelector('.hero-video');
  if (heroVid) {
    var heroSrc = heroVid.querySelector('source[data-src]');
    var conn = navigator.connection || navigator.webkitConnection;
    var skip =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      window.innerWidth <= 860 ||
      (conn && conn.saveData === true);

    if (heroSrc && !skip) {
      heroSrc.src = heroSrc.dataset.src;
      heroVid.preload = 'auto';
      heroVid.load();
      heroVid.addEventListener('playing', function () {
        heroVid.classList.add('ready');
      });
      var hp = heroVid.play();
      if (hp && hp.catch) {
        hp.catch(function () { /* autoplay blocked - poster stays, no error */ });
      }
    }
  }

  /* ---------- Our Proven Process: hover animation + stage modal ----------
     The gold progress line chases whichever stage is hovered; clicking a
     stage opens its photograph and the fuller description.
     ---------------------------------------------------------------------- */
  var stepsRow = document.querySelector('.steps');
  var procModal = document.getElementById('proc-modal');

  if (stepsRow) {
    var stepBtns = Array.prototype.slice.call(stepsRow.querySelectorAll('button.step'));

    // progress line follows the hovered stage
    function setFill(i) {
      var f = stepBtns.length ? (i + 0.5) / stepBtns.length : 0;
      stepsRow.style.setProperty('--fill', f.toFixed(3));
    }
    stepBtns.forEach(function (b, i) {
      b.addEventListener('mouseenter', function () { setFill(i); });
      b.addEventListener('focus', function () { setFill(i); });
    });
    stepsRow.addEventListener('mouseleave', function () {
      if (!procModal || procModal.hidden) stepsRow.style.setProperty('--fill', '0');
    });

    if (procModal) {
      var pImg   = document.getElementById('proc-img');
      var pNum   = document.getElementById('proc-num');
      var pTitle = document.getElementById('proc-title');
      var pText  = document.getElementById('proc-text');
      var pCount = document.getElementById('proc-count');
      var pClose = procModal.querySelector('.proc-close');
      var pPrev  = procModal.querySelector('.proc-prev');
      var pNext  = procModal.querySelector('.proc-next');
      var pIndex = 0, procLastFocus = null;

      var procPanel = procModal.querySelector('.proc-panel');
      var fadeTimer = null;
      var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      // Preload every stage image so a crossfade never lands on a blank frame.
      // We also record each one's true aspect ratio: the stage photos are a
      // mix of landscape and portrait, and the hover card sizes itself to the
      // photo rather than cropping it into a fixed box.
      var procRatio = [];
      stepBtns.forEach(function (b, i) {
        var im = new Image();
        im.onload = function () {
          if (im.naturalHeight) procRatio[i] = im.naturalWidth / im.naturalHeight;
        };
        im.src = b.dataset.img;
      });

      function applyStage() {
        var b = stepBtns[pIndex];
        pImg.src = b.dataset.img;
        pImg.alt = b.dataset.title + ' — ' + b.dataset.num;
        pNum.textContent = b.dataset.num;
        pTitle.textContent = b.dataset.title;
        pText.innerHTML = b.dataset.body;
        pCount.textContent = (pIndex + 1) + ' / ' + stepBtns.length;
      }

      function renderStage(i, fade) {
        pIndex = (i + stepBtns.length) % stepBtns.length;
        stepBtns.forEach(function (x) { x.setAttribute('aria-expanded', 'false'); });
        stepBtns[pIndex].setAttribute('aria-expanded', 'true');
        setFill(pIndex);

        window.clearTimeout(fadeTimer);
        if (fade && !reduceMotion) {
          procPanel.classList.add('swapping');
          fadeTimer = window.setTimeout(function () {
            applyStage();
            procPanel.classList.remove('swapping');
          }, 300);
        } else {
          procPanel.classList.remove('swapping');
          applyStage();
        }
      }

      function openStage(i) {
        procLastFocus = document.activeElement;
        renderStage(i);
        procModal.hidden = false;
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(function () { procModal.classList.add('open'); });
        pClose.focus();
      }

      function closeStage() {
        window.clearTimeout(fadeTimer);
        procPanel.classList.remove('swapping');
        procModal.classList.remove('open');
        document.body.style.overflow = '';
        stepBtns.forEach(function (x) { x.setAttribute('aria-expanded', 'false'); });
        stepsRow.style.setProperty('--fill', '0');
        window.setTimeout(function () { procModal.hidden = true; pImg.src = ''; }, 240);
        if (procLastFocus && procLastFocus.focus) procLastFocus.focus();
      }

      /* ---- Autoplay: "See the Full Process" walks all five, 2s apart ---- */
      var playBtn   = document.getElementById('proc-play');
      var progress  = document.getElementById('proc-progress');
      var autoTimer = null;
      var autoOn    = false;

      var STAGE_MS = 3000;

      function tickBar() {
        if (!progress) return;
        progress.hidden = false;
        progress.classList.remove('run');
        void progress.offsetWidth;        // restart the CSS animation
        progress.classList.add('run');
      }

      function stopAuto() {
        autoOn = false;
        window.clearTimeout(autoTimer);
        autoTimer = null;
        if (progress) { progress.classList.remove('run'); progress.hidden = true; }
        pCount.classList.remove('auto');
      }

      function queueNext() {
        window.clearTimeout(autoTimer);
        autoTimer = window.setTimeout(function () {
          if (!autoOn) return;
          if (pIndex >= stepBtns.length - 1) {
            stopAuto();                    // finish on the last stage, stay open
            return;
          }
          renderStage(pIndex + 1, true);
          pCount.classList.add('auto');
          tickBar();
          queueNext();
        }, STAGE_MS);
      }

      function startAuto() {
        closePeek(true);
        openStage(0);
        autoOn = true;
        pCount.classList.add('auto');
        tickBar();
        queueNext();
      }

      if (playBtn) {
        playBtn.addEventListener('click', function () {
          if (autoOn) { stopAuto(); return; }
          startAuto();
        });
      }

      stepBtns.forEach(function (b, i) {
        b.addEventListener('click', function () { stopAuto(); closePeek(true); openStage(i); });
      });

      /* ---- Hover peek: the stage photo rises out of the number ----------
         Pointing at a step shows its image in a small card above the row.
         Click still opens the full modal with the long description.
         Only on real hover devices; touch and keyboard use click/Enter.
         ------------------------------------------------------------------ */
      var canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      var peek = null, peekIn = null, peekOut = null, peekIdx = -1;

      function buildPeek() {
        if (peek) return peek;
        peek = document.createElement('div');
        peek.className = 'step-peek';
        peek.setAttribute('aria-hidden', 'true');
        peek.innerHTML =
          '<div class="step-peek-media"><img alt=""></div>' +
          '<div class="step-peek-body">' +
            '<span class="step-peek-num"></span>' +
            '<span class="step-peek-title"></span>' +
            '<span class="step-peek-p"></span>' +
            '<span class="step-peek-cue">Click for the full stage <span aria-hidden="true">&rarr;</span></span>' +
          '</div>' +
          '<span class="step-peek-tip"></span>';
        document.body.appendChild(peek);
        return peek;
      }

      function placePeek(btn) {
        var r = btn.getBoundingClientRect();
        var w = peek.offsetWidth, h = peek.offsetHeight;
        var cx = r.left + r.width / 2;
        var left = Math.round(cx - w / 2);
        var pad = 12;
        left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));
        var above = Math.round(r.top - h - 16);
        var below = Math.round(r.bottom + 16);
        var useBelow = above < pad && (window.innerHeight - r.bottom) > r.top;
        var top = useBelow ? below : above;
        // keep the whole card on screen even when neither side has full room
        top = Math.max(pad, Math.min(top, window.innerHeight - h - pad));
        peek.classList.toggle('below', useBelow);
        peek.style.left = left + 'px';
        peek.style.top  = top + 'px';
        // tail points back at the number, even when the card is clamped
        var tip = peek.querySelector('.step-peek-tip');
        tip.style.left = Math.round(Math.max(18, Math.min(cx - left, w - 18))) + 'px';
      }

      function openPeek(i) {
        if (!canHover) return;
        if (procModal && !procModal.hidden) return;   // never over the modal
        var btn = stepBtns[i];
        buildPeek();
        if (peekIdx !== i) {
          peekIdx = i;
          var pm = peek.querySelector('.step-peek-media');
          var im = peek.querySelector('img');
          // size the frame to the photo so nothing gets cropped out
          function fitFrame(r) {
            if (!r) return;
            r = Math.max(0.72, Math.min(r, 1.78));
            pm.style.aspectRatio = r.toFixed(4);
            // portrait shots get a narrower card so they stay a sane height
            peek.style.width = (r < 1 ? 288 : 330) + 'px';
          }
          fitFrame(procRatio[i]);
          im.onload = function () {
            if (peekIdx === i && im.naturalHeight) {
              procRatio[i] = im.naturalWidth / im.naturalHeight;
              fitFrame(procRatio[i]);
              placePeek(btn);
            }
          };
          peek.querySelector('img').src = btn.dataset.img;
          peek.querySelector('img').alt = btn.dataset.title;
          peek.querySelector('.step-peek-num').textContent = btn.dataset.num;
          peek.querySelector('.step-peek-title').textContent = btn.dataset.title;
          peek.querySelector('.step-peek-p').textContent =
            btn.querySelector('.step-p') ? btn.querySelector('.step-p').textContent : '';
        }
        peek.classList.add('ready');
        placePeek(btn);
        requestAnimationFrame(function () { peek.classList.add('open'); });
      }

      function closePeek(now) {
        if (!peek) return;
        peek.classList.remove('open');
        peekIdx = -1;
        window.clearTimeout(peekOut);
        if (now) peek.classList.remove('ready');
        else peekOut = window.setTimeout(function () { peek.classList.remove('ready'); }, 220);
      }

      stepBtns.forEach(function (b, i) {
        b.addEventListener('mouseenter', function () {
          window.clearTimeout(peekIn);
          window.clearTimeout(peekOut);
          peekIn = window.setTimeout(function () { openPeek(i); }, 90);
        });
        b.addEventListener('mouseleave', function () { window.clearTimeout(peekIn); });
      });
      stepsRow.addEventListener('mouseleave', function () {
        window.clearTimeout(peekIn);
        closePeek(false);
      });
      window.addEventListener('scroll', function () { closePeek(true); }, { passive: true });
      window.addEventListener('resize', function () { closePeek(true); });

      pClose.addEventListener('click', function () { stopAuto(); closeStage(); });
      pPrev.addEventListener('click', function () { stopAuto(); renderStage(pIndex - 1); });
      pNext.addEventListener('click', function () { stopAuto(); renderStage(pIndex + 1); });
      procModal.addEventListener('click', function (e) {
        if (e.target === procModal) { stopAuto(); closeStage(); }
      });
      document.addEventListener('keydown', function (e) {
        if (procModal.hidden) return;
        if (e.key === 'Escape') { stopAuto(); closeStage(); return; }
        if (e.key === 'ArrowLeft')  { e.preventDefault(); stopAuto(); renderStage(pIndex - 1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); stopAuto(); renderStage(pIndex + 1); }
      });
      // keep tab focus inside the dialog
      procModal.addEventListener('keydown', function (e) {
        if (e.key !== 'Tab') return;
        var f = Array.prototype.slice.call(procModal.querySelectorAll('button'));
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
    }
  }


  /* ---------- Careers: org chart, role detail, application ---------------
     Hovering a role shows a short summary card; opening one shows the full
     description. The application form has no server behind it, so it builds
     a pre-filled email to the careers address instead of pretending to send.
     ---------------------------------------------------------------------- */
  var orgScroll = document.querySelector('.job-table');
  var roleModal = document.getElementById('role-modal');
  var roleDataEl = document.getElementById('role-data');

  if (orgScroll && roleModal && roleDataEl) {
    var ROLES = {};
    try { ROLES = JSON.parse(roleDataEl.textContent); } catch (e) { ROLES = {}; }

    var nodes = Array.prototype.slice.call(orgScroll.querySelectorAll('.job-row'));


    var rTitle = document.getElementById('role-title');
    var rDept  = document.getElementById('role-dept');
    var rBadge = document.getElementById('role-badge');
    var rBody  = document.getElementById('role-body');
    var rActs  = document.getElementById('role-actions');
    var rClose = roleModal.querySelector('.role-close');
    var roleLastFocus = null;

    /* ---- hover card ---- */
    var canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    var peek = null, peekIn = null, peekOut = null, peekKey = null;

    function buildPeek() {
      if (peek) return peek;
      peek = document.createElement('div');
      peek.className = 'org-peek';
      peek.setAttribute('aria-hidden', 'true');
      peek.innerHTML = '<p class="pk-dept"></p><h4></h4>' +
                       '<p class="pk-why"></p>' +
                       '<span class="pk-cue">Open the full description &rarr;</span>';
      document.body.appendChild(peek);
      return peek;
    }

    function placePeek(btn) {
      var r = btn.getBoundingClientRect();
      var w = peek.offsetWidth, h = peek.offsetHeight, pad = 12;
      var left = Math.round(r.left + r.width / 2 - w / 2);
      left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));
      var top = Math.round(r.top - h - 12);
      if (top < pad) top = Math.round(r.bottom + 12);
      top = Math.max(pad, Math.min(top, window.innerHeight - h - pad));
      peek.style.left = left + 'px';
      peek.style.top = top + 'px';
    }

    function openPeek(btn) {
      if (!canHover || !roleModal.hidden) return;
      var key = btn.dataset.role, d = ROLES[key];
      if (!d) return;
      buildPeek();
      if (peekKey !== key) {
        peekKey = key;
        peek.querySelector('.pk-dept').textContent = d.d;
        peek.querySelector('h4').textContent = d.t;
        peek.querySelector('.pk-why').textContent = d.why;
        peek.querySelector('.pk-cue').style.display = d.pending ? 'none' : '';
      }
      peek.classList.add('ready');
      placePeek(btn);
      requestAnimationFrame(function () { peek.classList.add('open'); });
    }

    function closePeek(now) {
      if (!peek) return;
      peek.classList.remove('open');
      peekKey = null;
      window.clearTimeout(peekOut);
      if (now) peek.classList.remove('ready');
      else peekOut = window.setTimeout(function () { peek.classList.remove('ready'); }, 200);
    }

    /* ---- detail modal ---- */
    function section(title, htmlStr) {
      return htmlStr ? '<h4>' + title + '</h4>' + htmlStr : '';
    }

    function openRole(key) {
      var d = ROLES[key];
      if (!d) return;
      closePeek(true);
      roleLastFocus = document.activeElement;
      rDept.textContent = d.d;
      rTitle.textContent = d.t;
      rBadge.textContent = d.pending ? 'Details coming soon'
                         : (d.open ? 'Now hiring' : 'Not currently open');
      rBadge.classList.toggle('is-open', !!d.open);

      rBody.innerHTML =
        '<p class="why">' + d.why + '</p>' +
        section('What you own', d.own) +
        section('What we are looking for', d.look) +
        section('What good looks like', d.good);

      var href = 'apply.html?role=' + encodeURIComponent(d.t);
      if (d.pending) {
        rActs.innerHTML = '<a class="btn btn-outline" href="apply.html">Introduce Yourself ' +
          '<span class="arw">&rarr;</span></a>' +
          '<p class="note">The full description for this role is being finalised.</p>';
      } else if (d.open) {
        rActs.innerHTML = '<a class="btn btn-gold" href="' + href + '">Apply for This Role ' +
          '<span class="arw">&rarr;</span></a>' +
          '<p class="note">Applications go to careers@runningtuba.com.</p>';
      } else {
        rActs.innerHTML = '<a class="btn btn-outline" href="' + href + '">Introduce Yourself ' +
          '<span class="arw">&rarr;</span></a>' +
          '<p class="note">We are not advertising this role today, but we keep good people on file.</p>';
      }

      roleModal.hidden = false;
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(function () { roleModal.classList.add('open'); });
      rClose.focus();
    }

    function closeRole() {
      roleModal.classList.remove('open');
      document.body.style.overflow = '';
      window.setTimeout(function () { roleModal.hidden = true; }, 240);
      if (roleLastFocus && roleLastFocus.focus) roleLastFocus.focus();
    }

    nodes.forEach(function (b) {
      b.addEventListener('click', function () { openRole(b.dataset.role); });
      b.addEventListener('mouseenter', function () {
        window.clearTimeout(peekIn); window.clearTimeout(peekOut);
        peekIn = window.setTimeout(function () { openPeek(b); }, 110);
      });
      b.addEventListener('mouseleave', function () { window.clearTimeout(peekIn); });
    });
    orgScroll.addEventListener('mouseleave', function () {
      window.clearTimeout(peekIn); closePeek(false);
    });
    window.addEventListener('scroll', function () { closePeek(true); }, { passive: true });
    window.addEventListener('resize', function () { closePeek(true); });

    rClose.addEventListener('click', closeRole);
    roleModal.addEventListener('click', function (e) {
      if (e.target === roleModal) closeRole();
    });
    document.addEventListener('keydown', function (e) {
      if (!roleModal.hidden && e.key === 'Escape') closeRole();
    });
    roleModal.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var f = Array.prototype.slice.call(
        roleModal.querySelectorAll('button, a[href]'));
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

  }

  /* ---- application form -------------------------------------------------
     No server: on submit we validate, then build a mailto: so the applicant
     sends a real email (with their resume attached) to the careers address. */
  var applyForm = document.getElementById('apply-form');
  if (applyForm) {
    /* The role arrives in the query string from the careers page. */
    (function prefillRole() {
      var sel = document.getElementById('ap-role');
      if (!sel) return;
      var m = /[?&]role=([^&]+)/.exec(window.location.search);
      if (!m) return;
      var want = decodeURIComponent(m[1].replace(/\+/g, ' '));
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === want) { sel.selectedIndex = i; return; }
      }
    })();
    var apSuccess = document.getElementById('apply-success');
    var apSummary = document.getElementById('apply-summary');
    var apMailto  = document.getElementById('apply-mailto');
    var apReset   = document.getElementById('apply-reset');
    var CAREERS   = 'careers@runningtuba.com';

    function apError(field, msg) {
      var slot = field.querySelector('.err');
      var input = field.querySelector('input, select, textarea');
      if (slot) slot.textContent = msg || '';
      if (input) {
        if (msg) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
      }
      return !msg;
    }

    applyForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = true, firstBad = null;
      applyForm.querySelectorAll('.field').forEach(function (field) {
        var input = field.querySelector('input, select, textarea');
        if (!input || !input.required) return;
        var v = (input.value || '').trim(), msg = '';
        if (!v) msg = 'This field is required.';
        else if (input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v))
          msg = 'Enter a valid email address.';
        if (!apError(field, msg)) { ok = false; if (!firstBad) firstBad = input; }
      });
      if (!ok) { if (firstBad) firstBad.focus(); return; }

      var g = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
      var role = g('ap-role'), name = g('ap-name');
      var lines = [
        'Position: ' + role,
        '',
        'Name: ' + name,
        'Email: ' + g('ap-email'),
        'Phone: ' + g('ap-phone'),
        'Based in: ' + g('ap-city'),
        '',
        'Years of relevant experience: ' + g('ap-years'),
        'Certifications / manufacturer training: ' + (g('ap-certs') || '-'),
        'LinkedIn / portfolio: ' + (g('ap-link') || '-'),
        '',
        'Authorized to work in the US: ' + g('ap-auth'),
        'Valid driver\u2019s license: ' + g('ap-license'),
        'Available evenings / weekends / travel: ' + g('ap-hours'),
        'How they heard about us: ' + (g('ap-heard') || '-'),
        '',
        'Why this role, and what I have worked on:',
        g('ap-note'),
        '',
        '--',
        'Resume attached.'
      ];
      apMailto.href = 'mailto:' + CAREERS +
        '?subject=' + encodeURIComponent('Application: ' + role + ' - ' + name) +
        '&body=' + encodeURIComponent(lines.join('\n'));
      apSummary.textContent = 'Applying for ' + role + ' as ' + name + '.';

      applyForm.classList.add('hidden');
      apSuccess.classList.remove('hidden');
      apSuccess.setAttribute('tabindex', '-1');
      apSuccess.focus();
      apSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    applyForm.querySelectorAll('input, select, textarea').forEach(function (input) {
      input.addEventListener('input', function () {
        var f = input.closest('.field');
        if (f && input.getAttribute('aria-invalid') === 'true') apError(f, '');
      });
    });

    if (apReset) {
      apReset.addEventListener('click', function () {
        apSuccess.classList.add('hidden');
        applyForm.classList.remove('hidden');
        applyForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }

  /* ---------- Image protection (Task 5) ----------------------------------
     Right-click and drag are blocked on IMAGES ONLY (including the gallery
     buttons that wrap them and the lightbox). Everywhere else the browser's
     own menu still works, so links, text fields and the phone number behave
     normally.
     ---------------------------------------------------------------------- */
  function onImage(t) {
    return t && t.closest && t.closest('img, picture, .shot, #lb-img');
  }
  document.addEventListener('contextmenu', function (e) {
    if (onImage(e.target)) e.preventDefault();
  });
  document.addEventListener('dragstart', function (e) {
    if (onImage(e.target)) e.preventDefault();
  });
  document.querySelectorAll('img').forEach(function (img) {
    img.setAttribute('draggable', 'false');
  });

  /* ---------- Note -------------------------------------------------------
     No scroll-reveal / fade-in animation by design. Content is always
     rendered visible so the page screenshots, prints and exports to PDF
     intact for presentation use. Motion is limited to hover states in CSS.
     ---------------------------------------------------------------------- */
})();
