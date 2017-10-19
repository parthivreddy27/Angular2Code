import { Angular2CodePage } from './app.po';

describe('angular2-code App', () => {
  let page: Angular2CodePage;

  beforeEach(() => {
    page = new Angular2CodePage();
  });

  it('should display welcome message', () => {
    page.navigateTo();
    expect(page.getParagraphText()).toEqual('Welcome to app!');
  });
});
