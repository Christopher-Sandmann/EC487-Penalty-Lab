# Mathematical and statistical method

## Exact classroom technology

Rows are kicker U/N, columns keeper U/N; both letters refer to the kicker’s predeclared natural side:

```
         keeper U  keeper N
kicker U   .5911     .9410
kicker N   .9310     .7122
```

These are exact teaching-game probabilities, not estimates of contemporary football. The brief attributes the classroom example to Palacios-Huerta (2003), “Professionals Play Minimax”; this project does not reconstruct that article’s empirical sample. `content/game-config.json` stores integer numerators with denominator 10,000. `src/lib/math.ts` derives the minimax probabilities and value. They are not fitted from classroom data.

Writing a=UU, b=UN, c=NU, d=NN and D=b+c-a-d, the kicker’s N frequency is r=(b-a)/D, the keeper’s is q=(c-a)/D, and the goal value is v=(bc-ad)/D. Tests verify both players’ indifference equations and all four cell lookups. A goalkeeper declaring Macro and facing a Micro kicker still chooses N by selecting **Micro**. All frequencies below use this definition, not the keeper’s own preferred side.

## Twelve prespecified streams

There are four role × participant-preference streams pooling opponents, plus eight role × participant-preference × opponent-preference streams. Preferences are immutable preregistration characteristics. Each resolved match supplies one kicker observation and one keeper observation. No inference attaches to additional, post-hoc subgroups. A missing stratum has no observed frequency, not a zero.

### Beta-mixture confidence sequence: independent derivation

Suppose within one stream X_t is binary and satisfies

`P(X_t=1 | the preceding observable history) = p`

for a common, constant p. For fixed theta in [0,1], the likelihood-ratio process

`L_n(theta,p) = (theta/p)^S ((1-theta)/(1-p))^(n-S)`

is a nonnegative mean-one martingale under that conditional model. Integration against the uniform density in theta preserves that property. Therefore

`E_n(p) = B(S+1, n-S+1) / (p^S (1-p)^(n-S))`.

Ville’s inequality bounds the probability of ever reaching 1/alpha_stream by alpha_stream. Inverting the strict inequality `log E_n(p) < log(1/alpha_stream)` gives the confidence set; the implementation returns its closure as an interval. Set alpha_stream=0.05/12. A union bound gives simultaneous protection over the twelve predefined streams and repeated inspection; overlap between the streams does not invalidate that union bound. This is a frequentist confidence sequence, not a Bayesian credible interval.

The implementation uses Lanczos log-gamma, analytic endpoint limits and bracketed bisection. At n=0 the interval is [0,1]. When S=0 its upper endpoint is `1-(alpha_stream/(n+1))^(1/n)`; S=n is its reflection. Numerical tests cover these cases, symmetry and roots up to n=1,000,000. A reproducible diagnostic simulation checks 1,000 families of twelve independent streams through 200 looks; it is not a proof or an assumption check for actual students.

Primary statistical reference: Steven R. Howard, Aaditya Ramdas, Jon McAuliffe and Jasjeet Sekhon, *Time-uniform, nonparametric, nonasymptotic confidence sequences*, Annals of Statistics (2021), especially the mixture construction. [Author manuscript](https://arxiv.org/abs/1810.08240), [HTML text](https://arxiv.org/html/1810.08240v9).

The guarantee does not cover arbitrary heterogeneous, coordinated or history-dependent classroom choices. At the minimax benchmark it tests the specified fresh-randomization model. Excluding neither benchmark is not proof of equilibrium, nor does a marginal-frequency comparison test every equilibrium implication or serial independence.

## Ordering, buffering and missing decisions

Every attempt receives a room serial number when matched, before either choice. Each stream uses this pre-choice order, with membership determined by the assigned roles and recorded preferences. A later result cannot jump ahead of an unresolved earlier member. If the earlier attempt resolves, the buffered prefix becomes available in its scheduled order.

If an earlier attempt is cancelled, its stream is **permanently frozen immediately before that attempt**. The cancellation is not treated as a zero, and the implementation does not skip it and restart the same live test. Later valid choices remain in descriptive frequencies, scores and the CSV, with a visible missing-data note; the confidence band states its own smaller prefix sample size. First-threshold crossing is reconstructed only within that inferential prefix.

This conservative design avoids silently treating choice-dependent completion or response ordering as random sampling. It cannot restore information from nonrespondents. A high timeout rate can leave little inferential information even when many valid games finish. Report the attrition and use descriptive summaries in that case. Freeze is stream-specific; an attempt not belonging to a stream does not halt it. The asynchronous random assignment is allowed only under the stated conditional model, not an unconditional independent-sampling claim.

## Chance-based, role-balanced scores

For a player, K is their mean matrix-implied goal chance in kicks and G is their mean matrix-implied stop (non-goal) chance in keeps. The headline score is `(K+G)/2`. A player needs at least one appearance in each role to qualify; a rank is provisional until six of each. Ties use actual equally role-weighted success, then stable alias/id. The score describes choices and encountered opponents, not latent skill against all opponents. Actual wins/losses are displayed separately.

A team’s score similarly gives half weight to its average kick chance and half to its average keep chance. No combined estimate appears when a team lacks either role. Team size is not rewarded. Same-team matches contribute complementary role payoffs without bonuses. At balanced minimax participation the benchmark combined chance is 50%; self-selected Micro/Macro differences are descriptive, not causal. Outcome-rate cards compare realized scoring/stopping with average specified conditional probabilities; no confidence interval is placed around a known matrix cell.

## Miss animations in v0.2

The server still samples exactly one uniform integer from 0 through 9,999 and declares a goal precisely below the matrix numerator. Only the non-goal residual selects a visual subtype; no second random draw or skill check changes the payoff. A goalkeeper's point and matrix-implied stop probability include physical saves and striker misses. Subtype thresholds are decorative, not empirical parameters. See `change-log.md` and the exhaustive tests in `tests/visual.test.mjs`.
