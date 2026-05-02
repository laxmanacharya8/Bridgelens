# Judge Checklist

## Functionality

- [ ] English → Nepali works
- [ ] Nepali → English works
- [ ] English → Tamang works
- [ ] Tamang → English works
- [ ] Nepali → Tamang works
- [ ] Tamang → Nepali works
- [ ] Page translation works
- [ ] Selection translation works
- [ ] Restore page works

## Usability

- [ ] Source and Destination are obvious
- [ ] Source and Destination cannot stay the same
- [ ] Swap is one click
- [ ] Bilingual mode is easy to understand
- [ ] Replace mode is available for full-page reading
- [ ] Missing-token state is clear

## System design

- [ ] Token is not hardcoded
- [ ] Background worker owns API calls
- [ ] Content script does not see the token
- [ ] Sentence cache is implemented
- [ ] Request queue/rate control is implemented
- [ ] Code is split by responsibility

## Demo readiness

- [ ] README has setup instructions
- [ ] Demo script exists
- [ ] `.env.example` exists
- [ ] MIT license exists
- [ ] Package script exists
