PORT ?= 8790
HOST ?= 127.0.0.1
URL  := http://$(HOST):$(PORT)/
# The headless tests serve the game themselves, on their own port.
TESTPORT ?= 8791

.PHONY: run serve test test-all voice voice-cast voice-review voice-check voice-hear music music-check
.DEFAULT_GOAL := run

# Serve the game and open it in the browser once the server answers. Ctrl-C stops the server.
# If something is already serving on $(PORT), just open the page. NOOPEN=1 skips the browser.
run: | node_modules
	@if curl -sf -o /dev/null $(URL); then \
		echo "Already running on $(URL)"; \
		[ -n "$(NOOPEN)" ] || setsid -f xdg-open $(URL) >/dev/null 2>&1; \
	else \
		[ -n "$(NOOPEN)" ] || ( for i in $$(seq 50); do \
			curl -sf -o /dev/null $(URL) && exec setsid -f xdg-open $(URL) >/dev/null 2>&1; \
			sleep 0.1; \
		done ) & \
		echo "Saab & Run on $(URL)  (Ctrl-C to stop)"; \
		exec python3 -m http.server $(PORT) --bind $(HOST); \
	fi

# Just the server, no browser.
serve: | node_modules
	python3 -m http.server $(PORT) --bind $(HOST)

# Headless playthrough of all seven days (screenshots land in out/). Must end with '#7 idle' and
# 'no errors'.
test: | node_modules
	PORT=$(TESTPORT) node tools/shot.mjs story

# The story, day 1 driven with real key presses, the story's no-warp checks (race won with keys,
# the day 7 chaser catching up by itself, the cat with keys, Parvaneh's walk, the hospital
# driveway, fail / retry), and the patrol / avbrott scenarios. A failed check ends 'N errors'.
test-all: | node_modules
	PORT=$(TESTPORT) node tools/shot.mjs story m1 m5race m7chase m4cat lotwalk hospdrive retry start report pursuit interrupt errands

node_modules:
	npm install

# The voices (features/implemented/a_fully_voiced_game.md, tools/voice/voice.mjs). `make voice DRY=1`
# says what would be made and what it costs, without a request; `make voice` makes what is missing
# in cast.json's scope (WHO=a,b LIMIT=n DAY=n MAX=chars ALL=1 PRUNE=1 REPROCESS=1; REPROCESS=1 WHO=a,b
# redoes only those roles, e.g. after a child's shift changed: features/implemented/barnroster.md).
VOICE_FLAGS = $(if $(DRY),--dry) $(if $(WHO),--who $(WHO)) $(if $(LIMIT),--limit $(LIMIT)) $(if $(DAY),--day $(DAY)) $(if $(MAX),--max $(MAX)) $(if $(ALL),--all) $(if $(PRUNE),--prune)
voice:
	node tools/voice/voice.mjs $(if $(REPROCESS),reprocess $(if $(WHO),--who $(WHO)),$(VOICE_FLAGS))
# Auditions for a role: its Voice Library candidates (SEARCH=n finds n more). (DESIGN=1 would add
# Voice Design candidates, but a designed voice needs a free voice slot: not used, see the feature.)
voice-cast:
	node tools/voice/voice.mjs cast $(WHO) $(if $(SEARCH),--search $(SEARCH)) $(if $(DESIGN),--design) $(if $(ROUNDS),--rounds $(ROUNDS))
# The review page: candidates, the review list, every line by day and scene, the music.
voice-review:
	PORT=$(or $(REVIEWPORT),8795) node tools/voice/review.mjs
voice-check:
	node tools/voice/voice.mjs check
# Listen to the clips as the game plays them (after a child's shift): pitch and words per role, free.
voice-hear:
	node tools/voice/voice.mjs hear $(if $(WHO),--who $(WHO))

# The music (features/implemented/a_fully_voiced_game.md section 8, tools/music/music.mjs): one take
# for each cue in tools/music/cues.json that has none, processed into assets/music/. `make music DRY=1`
# says what would be made and what it costs, without a request; ONLY=a,b limits it to those cues;
# REPROCESS=1 redoes the processing from .cache (free). Nothing is made past cues.json's maxSeconds.
music:
	node tools/music/music.mjs $(if $(REPROCESS),reprocess,$(if $(DRY),--dry) $(if $(ONLY),--only $(ONLY)))
music-check:
	node tools/music/music.mjs check
