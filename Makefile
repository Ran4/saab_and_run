PORT ?= 8790
HOST ?= 127.0.0.1
URL  := http://$(HOST):$(PORT)/
# The headless tests serve the game themselves, on their own port.
TESTPORT ?= 8791

.PHONY: run serve test test-all
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
