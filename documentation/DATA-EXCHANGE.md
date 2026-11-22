# Trajectory and orbit exchange (SPICE and CCSDS)

ASTRA LAB reads and writes the formats mission-analysis tools use, without needing the SPICE toolkit or any other package.

| Format | Read | Write | Where in the app |
|---|---|---|---|
| CCSDS OEM 2.0, KVN text (several segments, covariance blocks, accelerations) | yes | yes | Analysis > Report: *Trajectory (CCSDS OEM)*; *Compare with a trajectory file…* |
| CCSDS OEM 2.0, NDM/XML | yes | yes | *Trajectory (OEM XML)* |
| SPICE SPK binary kernel (.bsp): types 2, 3, 8, 9, 12, 13, little- and big-endian, segment chaining | yes | type 13 | *Trajectory (SPICE SPK .bsp)*; compare |
| SPICE text ("ET x y z vx vy vz", MKSPK input) | yes | yes | *Trajectory (SPICE text)* |
| CCSDS OPM (state vector or Keplerian elements, mass) | yes | yes (with elements) | Planner > Environment: *Open an OPM or OMM file…*; Analysis: *Final state (CCSDS OPM)* |
| CCSDS OMM (mean elements: KVN, XML, CelesTrak JSON) | yes | no | Planner > Environment |

Code: `src/core/ccsds.js` (CCSDS, time systems, Keplerian elements) and `src/core/spk.js` (DAF/SPK reader and writer).

## How it was checked

* **SPK reader**: `scripts/make-spk-fixtures.py` uses NASA/NAIF CSPICE N0067 (through SpiceyPy) to write a kernel with one segment of
  each supported type plus a two-level chain (orbiter around the Moon, Moon around the Earth), and records the states CSPICE computes.
  `tests/spk-ccsds.test.js` reads that kernel and agrees with CSPICE to better than 1e-9 km and 1e-11 km/s.
* **SPK writer**: kernels written by ASTRA LAB (including one from a real launch to 200 km) were opened by CSPICE (`spkgeo`, `dafec`);
  states agreed to 2e-12 km and the comment area read back.
* **OEM**: files written by the independent Python `oem` library (KVN and XML, two segments, covariance) are test fixtures, and that
  library reads the OEM files ASTRA LAB writes (3,360 states of a real launch in TDB).

## Time systems

File time tags in UTC, TAI, TT (TDT), TDB (ET), GPS and UT1 are converted to the mission epoch's time scale with the IERS leap-second
table (1972 to 2017) and the leading terms of TDB-TT. SPK files are always TDB. OEM export takes `timeSystem` (UTC by default).
UT1-UTC (below 0.9 s) is not modelled. TCB, TCG and spacecraft clocks are refused with a plain message.

## Limits

* The inertial frame is a simplified EME2000 (planet spin axis = z); see KNOWN-LIMITATIONS.md.
* OMM mean elements are SGP4 elements; they are turned into a two-body state, so a low orbit can be tens of km off SGP4.
* SPK segments of other types (1, 5, 10, 14, 15, 17, 18, 19, 20, 21) are listed but not evaluated. Frames other than J2000/ECLIPJ2000
  are reported by number and cannot be chained with segments in another frame.
