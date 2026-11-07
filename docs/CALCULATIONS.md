# VanVolt calculation reference

Every formula used by the engine (`packages/engine/src`). Symbols: P power (W), E energy (Wh),
V voltage (V), I current (A), η efficiency (fraction), L one-way cable length (m).

All results are **estimates** for planning. They depend on the stated assumptions, which are
listed in the app under _Assumptions_ and in the PDF report.

## 1. Consumption (`consumption.ts`)

Per appliance (per unit):

```
E_on      = P_running × hours/day × duty cycle
E_standby = P_standby × (24 − hours/day)
E_useday  = quantity × (E_on + E_standby)
E_week    = E_useday × days/week + quantity × P_standby × 24 × (7 − days/week)
E_avgday  = E_week / 7
```

AC loads run through the inverter, so the battery supplies `E_ac / η_inverter`.
Inverter idle draw adds `P_idle × on-hours/day` whenever AC loads exist.

```
Battery Wh/day = E_dc + E_ac/η + P_idle × h_on
Ah/day         = Wh/day ÷ V_bank_nominal
```

**Continuous vs peak demand.** Loads marked _concurrent_ can all run together. Loads marked
_exclusive_ (e.g. kettle, hair dryer) are never used at the same time as each other, but can run
alongside the concurrent set.

```
P_continuous = Σ concurrent running + max(exclusive running)
P_peak       = max over loads L of: (P_continuous + surge_L − running_L)   for concurrent L
                                    (Σ concurrent + surge_L)               for exclusive L
```

These are computed separately for AC (inverter sizing), DC, and at the battery
(DC + AC/η + idle).

## 2. Battery (`battery.ts`)

```
V_bank = V_module × series        Ah_bank = Ah_module × parallel        E_nominal = V × Ah
E_usable  = E_nominal × DoD × k_Peukert
Autonomy  = E_usable / battery Wh/day
Ah needed = Wh/day × target days / (V × DoD × k_Peukert)
```

**Peukert** (lead-acid): capacity at current I relative to the rated capacity
`C(I)/C_rated = (I_rated / I)^(k−1)` with `I_rated = C_rated / 20 h`. VanVolt evaluates it at
the daily consumption spread over 16 active hours, and caps the factor at 1.0, so there is no
credit for discharging more slowly than the rating. LiFePO4 uses k = 1.05 against a 1C reference,
so in practice it has no Peukert reduction below 1C.

**Cycle life** is interpolated log-linearly between datasheet points. **Service life**
uses an energy-throughput model, `years = cycles × DoD × E_nominal / (Wh/day × 365)`. It ignores
calendar ageing, so it is an upper bound.

**Design minimum voltage** is 12.0 V per 12.8 V LiFePO4 block and 11.5 V per 12 V lead-acid
block. It is used for worst-case DC currents.

## 3. Solar (`solar.ts`)

```
E_month (Wh/day) = P_installed × PSH_month × Π(1 − loss_i) × η_controller × f_PWM
```

- `PSH` is the PVGIS 5.3 monthly average daily in-plane irradiation (kWh/m²/day). Flat data
  sets use 0° tilt; tilted data sets use 35°, south-facing.
- Losses are shading, orientation, temperature, soiling, reflection/angle-of-incidence, and
  wiring/mismatch.
- `f_PWM = (V_nominal × 13.6/12) / (Vmp × panels in series)`, capped at 1, or 0.75 if Vmp is
  unknown. Following Victron's white paper, a PWM controller holds the panel near battery
  voltage. MPPT uses f = 1.
- Cold-weather open-circuit voltage at −10 °C cell temperature:
  `Voc_cold = Voc × n_series × (1 + β_Voc × (−10 − 25))`, checked against the controller limit.
- Controller output current at STC: `P × η_ctrl × η_wiring / (V × 13.6/12)`.

Cross-check: with PVGIS-like losses, VanVolt's London flat-roof annual yield agrees with the
PVGIS PVcalc figure to within 12 %. There is a unit test for this.

## 4. Inverter (`inverter.ts`)

```
Required continuous = AC continuous demand × (1 + margin)       (default margin 25 %)
DC input current    = P_ac / (V_min × η)
```

Per-load checks:

- **Incompatible** if running power exceeds the inverter's continuous rating, if the surge
  exceeds its peak rating, if no inverter is enabled, or if the load's DC current exceeds the
  battery's continuous discharge limit.
- **Warning** above 80 % of the continuous rating, for modified-sine-wave inverters driving
  motors, compressors, microwaves, induction hobs, electronics or dimmable lighting, or when
  a 12 V DC current is ≥ 100 A.

## 5. Charging (`charging.ts`)

```
Alternator via DC-DC: I = I_rated × count     Input I = I × V_bank × 13.6/12 / (V_vehicle × η)
Relay (VSR):          I = user estimate
Shore:                I = charger rating (or inverter/charger rating)
E_avg/day = I × V_bank × hours/day × days/week ÷ 7
Stored    = E × battery round-trip efficiency
```

The monthly balance compares stored energy against consumption. It assumes all charge passes
through the battery, which is conservative. Simultaneous charging current is checked against
the battery's maximum charge current.

## 6. Cables and protection (`cables.ts`)

```
R(T)   = R20 × (1 + 0.00393 × (T − 20))           IEC 60228 Class 5 copper R20
V_drop = I × R(T) × 2L                            round-trip length
Loss   = I × V_drop
```

Conductor selection is the smallest standard size that:

1. keeps `V_drop ≤ limit` (battery, inverter and charger output circuits 2.5 %; battery → busbar
   1 %; PV 3 %; DC-DC input 5 %), and
2. has a derated ampacity ≥ the protecting fuse rating.

Ampacity comes from ISO 10133:2000 Table A.1 at 30 °C ambient, by insulation rating.
Above 30 °C it is interpolated linearly to the ISO 60 °C factor (×0.75 at 70 °C insulation,
×0.82 at 85–90 °C, ×0.86 at 105 °C, ×0.89 at 125 °C). Bundling factors follow ABYC: ≤ 3
conductors ×0.70, 4–6 ×0.60, 7–24 ×0.50, 25+ ×0.40.

Fuse rating:

- The smallest rating ≥ 1.25 × design current that a suitable family offers.
- The family's DC voltage rating must be ≥ 1.2 × nominal.
- Lithium main fuses must come from high-interrupt families (Class T, MRBF).
- The fuse must not exceed the cable's derated ampacity.
- PV string circuits are not given automotive fuses; gPV guidance is shown instead.

## 7. Hourly simulation (`simulation.ts`)

- Solar: the month's daily energy is spread as a half-sine between sunrise and sunset. Day
  length is `(2/15)·acos(−tan φ · tan δ)` with `δ = 23.45°·sin(360/365·(284 + n))`
  (Cooper / PVEducation).
- Loads: daily energy is spread evenly over the usage window (morning 06–10, daytime 10–17,
  evening 17–23, night 22–06, or all day).
- The simulation is limited to 60 days so any input stays fast.
- Each hour, chargers supply loads directly. Any surplus charges the battery, limited by the
  maximum charge current, the taper above 95 % SoC (LiFePO4) or 80 % SoC (lead-acid), and
  round-trip efficiency. Any deficit discharges the battery down to the DoD floor; anything
  beyond that is recorded as unmet load.

## 8. 12 V / 24 V / 48 V comparison (`voltage.ts`)

For the same nominal energy and loads, VanVolt compares at each voltage: bank Ah, inverter
DC current, the battery → inverter conductor size and its loss, solar controller current, and
component availability in the library.
